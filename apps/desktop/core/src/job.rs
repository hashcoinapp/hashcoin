//! Miners live and die with the app (Oct 18: closed, crashed, updated or uninstalled builds left
//! their miners running, and four of them on one GPU made the PC lag).
//!
//! On Windows each miner is put in a job object that kills everything in it when the app's handle
//! to the job closes, which Windows does however the app ends. Only the miners go in the job, not
//! the app itself, so the updater's installer isn't killed when the app exits to update.
//! `stop_strays` stops miners left running from this app's miners folder by older versions.

use std::path::Path;
use std::process::Child;

/// Put a just-started miner in the app's job, so it stops when the app ends. False if Windows
/// refused (the miner still runs; it just isn't tied to the app).
pub fn adopt(child: &Child) -> bool {
    imp::adopt(child)
}

/// Stop processes whose program lives under `miners_dir`: miners an earlier run left behind. Call
/// once at startup, before mining starts (the app is single-instance, so none of them are ours).
/// Returns how many were stopped.
pub fn stop_strays(miners_dir: &Path) -> usize {
    imp::stop_strays(miners_dir)
}

#[cfg(windows)]
mod imp {
    use std::os::windows::io::AsRawHandle;
    use std::path::Path;
    use std::process::Child;
    use std::sync::OnceLock;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, TerminateProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
        PROCESS_TERMINATE,
    };

    /// The job, created once and never closed by us: Windows closes it when the app ends.
    static JOB: OnceLock<usize> = OnceLock::new();

    fn job() -> HANDLE {
        *JOB.get_or_init(|| unsafe {
            let h = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if h.is_null() {
                return 0;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let size = std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32;
            if SetInformationJobObject(h, JobObjectExtendedLimitInformation, &info as *const _ as *const _, size) == 0 {
                CloseHandle(h);
                return 0;
            }
            h as usize
        }) as HANDLE
    }

    pub fn adopt(child: &Child) -> bool {
        let j = job();
        !j.is_null() && unsafe { AssignProcessToJobObject(j, child.as_raw_handle() as HANDLE) != 0 }
    }

    pub fn stop_strays(miners_dir: &Path) -> usize {
        // Compare full program paths, case-insensitively, under the folder (with its separator, so
        // "miners2" doesn't match "miners").
        let mut prefix = miners_dir.to_string_lossy().to_lowercase();
        if !prefix.ends_with('\\') {
            prefix.push('\\');
        }
        let me = std::process::id();
        let mut stopped = 0;
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID_HANDLE_VALUE {
                return 0;
            }
            let mut e: PROCESSENTRY32W = std::mem::zeroed();
            e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut more = Process32FirstW(snap, &mut e) != 0;
            while more {
                if e.th32ProcessID != me && e.th32ProcessID != 0 {
                    let p = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE, 0, e.th32ProcessID);
                    if !p.is_null() {
                        let mut buf = [0u16; 1024];
                        let mut len = buf.len() as u32;
                        if QueryFullProcessImageNameW(p, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len) != 0 {
                            let path = String::from_utf16_lossy(&buf[..len as usize]).to_lowercase();
                            if path.starts_with(&prefix) && TerminateProcess(p, 1) != 0 {
                                stopped += 1;
                            }
                        }
                        CloseHandle(p);
                    }
                }
                more = Process32NextW(snap, &mut e) != 0;
            }
            CloseHandle(snap);
        }
        stopped
    }
}

#[cfg(not(windows))]
mod imp {
    use std::path::Path;
    use std::process::Child;

    // Elsewhere the app doesn't ship yet; miners are stopped by the normal stop path only.
    pub fn adopt(_child: &Child) -> bool {
        false
    }

    pub fn stop_strays(_miners_dir: &Path) -> usize {
        0
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::process::Command;
    use std::time::{Duration, Instant};

    /// A copy of a harmless Windows program in a temp "miners" folder, running for a while.
    fn stand_in(dir: &Path) -> Child {
        std::fs::create_dir_all(dir).unwrap();
        let exe = dir.join("stand-in-miner.exe");
        let windir = std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".into());
        std::fs::copy(Path::new(&windir).join("System32").join("PING.EXE"), &exe).unwrap();
        Command::new(&exe).args(["-n", "60", "127.0.0.1"]).stdout(std::process::Stdio::null()).spawn().unwrap()
    }

    fn exits_within(child: &mut Child, limit: Duration) -> bool {
        let t = Instant::now();
        while t.elapsed() < limit {
            if child.try_wait().unwrap().is_some() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        false
    }

    #[test]
    fn stops_programs_left_running_from_the_miners_folder() {
        let base = std::env::temp_dir().join(format!("hashcoin-job-test-{}", std::process::id()));
        let miners = base.join("miners");
        let mut stray = stand_in(&miners.join("forgeminer"));
        // A program in a folder that only starts with the same name is left alone.
        let mut neighbour = stand_in(&base.join("miners2"));
        assert_eq!(stop_strays(&miners), 1);
        assert!(exits_within(&mut stray, Duration::from_secs(5)));
        assert!(!exits_within(&mut neighbour, Duration::from_millis(300)));
        let _ = neighbour.kill();
        let _ = neighbour.wait();
        let _ = std::fs::remove_dir_all(&base);
    }

    /// Not a test by itself: run as a stand-in app by the test below. Starts a miner, puts it in
    /// the job, prints its PID and exits without stopping it.
    #[test]
    fn stand_in_app() {
        let Ok(dir) = std::env::var("HASHCOIN_JOB_STAND_IN_APP") else { return };
        let child = stand_in(Path::new(&dir));
        assert!(adopt(&child));
        println!("MINER_PID={}", child.id());
        std::process::exit(0);
    }

    #[test]
    fn a_miner_stops_when_the_app_ends() {
        let base = std::env::temp_dir().join(format!("hashcoin-job-exit-{}", std::process::id()));
        let out = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "job::tests::stand_in_app", "--nocapture", "--test-threads=1"])
            .env("HASHCOIN_JOB_STAND_IN_APP", &base)
            .output()
            .unwrap();
        let text = String::from_utf8_lossy(&out.stdout);
        let pid: u32 = text.split("MINER_PID=").nth(1).and_then(|r| r.split_whitespace().next()).expect("stand-in app printed no PID").parse().unwrap();
        let alive = |pid: u32| {
            let o = Command::new("tasklist").args(["/FI", &format!("PID eq {pid}"), "/NH"]).output().unwrap();
            String::from_utf8_lossy(&o.stdout).contains(&pid.to_string())
        };
        let t = Instant::now();
        while alive(pid) && t.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(100));
        }
        let still = alive(pid);
        if still {
            let _ = Command::new("taskkill").args(["/F", "/PID", &pid.to_string()]).output();
        }
        let _ = std::fs::remove_dir_all(&base);
        assert!(!still, "the miner kept running after the app ended");
    }

    #[test]
    fn adopts_a_started_miner_into_the_job() {
        let base = std::env::temp_dir().join(format!("hashcoin-job-adopt-{}", std::process::id()));
        let mut child = stand_in(&base);
        assert!(adopt(&child));
        let _ = child.kill();
        let _ = child.wait();
        let _ = std::fs::remove_dir_all(&base);
    }
}
