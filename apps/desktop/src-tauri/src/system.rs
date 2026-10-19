//! What the app needs to know about the PC: the graphics cards, how hot each NVIDIA card is, how
//! long since the last input, which apps use the graphics card, and whether an app is fullscreen. Windows APIs only, read in-process:
//! the app starts no helper programs (no PowerShell, no nvidia-smi), so the verified miner is the
//! only program it ever runs. Elsewhere these report nothing.

use hashcoin_core::Gpu;
use std::collections::HashMap;
use std::time::Duration;

/// NVIDIA cards, numbered like nvidia-smi and the miners' `--gpu` flag (PCI bus order).
pub fn nvidia_gpus() -> Vec<Gpu> {
    #[cfg(windows)]
    if let Some(api) = nvml::api() {
        return api.gpus();
    }
    Vec::new()
}

/// Temperature (°C) per NVIDIA card index.
pub fn nvidia_temps() -> HashMap<u32, u32> {
    #[cfg(windows)]
    if let Some(api) = nvml::api() {
        return api.temps();
    }
    HashMap::new()
}

/// The names of the PC's graphics adapters, from DirectX (software renderers left out).
#[cfg(windows)]
pub fn display_adapters() -> Vec<String> {
    use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE};
    let mut names = Vec::new();
    // SAFETY: DXGI calls on a factory we own; the description is a fixed, nul-padded array.
    unsafe {
        let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() else { return names };
        let mut i = 0;
        while let Ok(adapter) = factory.EnumAdapters1(i) {
            i += 1;
            let Ok(d) = adapter.GetDesc1() else { continue };
            if d.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 { continue; }
            let len = d.Description.iter().position(|&c| c == 0).unwrap_or(d.Description.len());
            names.push(String::from_utf16_lossy(&d.Description[..len]));
        }
    }
    names
}

#[cfg(not(windows))]
pub fn display_adapters() -> Vec<String> { Vec::new() }

/// NVIDIA's management library (nvml.dll, installed with the driver), loaded from System32 only.
#[cfg(windows)]
mod nvml {
    use super::*;
    use hashcoin_core::Vendor;
    use std::ffi::c_void;
    use std::sync::OnceLock;
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32};

    type Device = *mut c_void;

    #[repr(C)]
    #[derive(Default)]
    struct Memory { total: u64, free: u64, used: u64 }

    type InitFn = unsafe extern "C" fn() -> i32;
    type CountFn = unsafe extern "C" fn(*mut u32) -> i32;
    type HandleFn = unsafe extern "C" fn(u32, *mut Device) -> i32;
    type NameFn = unsafe extern "C" fn(Device, *mut u8, u32) -> i32;
    type MemoryFn = unsafe extern "C" fn(Device, *mut Memory) -> i32;
    type TemperatureFn = unsafe extern "C" fn(Device, u32, *mut u32) -> i32;

    pub struct Api { count: CountFn, handle: HandleFn, name: NameFn, memory: MemoryFn, temperature: TemperatureFn }

    pub fn api() -> Option<&'static Api> {
        static API: OnceLock<Option<Api>> = OnceLock::new();
        API.get_or_init(load).as_ref()
    }

    fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(Some(0)).collect() }

    fn load() -> Option<Api> {
        // SAFETY: the library stays loaded for the life of the process, and each symbol is cast to
        // the signature NVML documents for it.
        unsafe {
            let mut lib = LoadLibraryExW(wide("nvml.dll").as_ptr(), std::ptr::null_mut(), LOAD_LIBRARY_SEARCH_SYSTEM32);
            if lib.is_null() {
                // Older drivers keep it next to nvidia-smi. A full path, so nothing else is searched.
                let pf = std::env::var("ProgramW6432").or_else(|_| std::env::var("ProgramFiles")).ok()?;
                lib = LoadLibraryExW(wide(&format!(r"{pf}\NVIDIA Corporation\NVSMI\nvml.dll")).as_ptr(), std::ptr::null_mut(), 0);
            }
            if lib.is_null() { return None; }
            macro_rules! sym {
                ($name:literal as $t:ty) => {
                    std::mem::transmute::<unsafe extern "system" fn() -> isize, $t>(GetProcAddress(lib, concat!($name, "\0").as_ptr())?)
                };
            }
            let init = sym!("nvmlInit_v2" as InitFn);
            if init() != 0 { return None; }
            Some(Api {
                count: sym!("nvmlDeviceGetCount_v2" as CountFn),
                handle: sym!("nvmlDeviceGetHandleByIndex_v2" as HandleFn),
                name: sym!("nvmlDeviceGetName" as NameFn),
                memory: sym!("nvmlDeviceGetMemoryInfo" as MemoryFn),
                temperature: sym!("nvmlDeviceGetTemperature" as TemperatureFn),
            })
        }
    }

    impl Api {
        fn devices(&self) -> Vec<(u32, Device)> {
            // SAFETY: NVML is initialised and thread-safe; out-parameters are locals.
            unsafe {
                let mut n = 0;
                if (self.count)(&mut n) != 0 { return Vec::new(); }
                (0..n).filter_map(|i| {
                    let mut d: Device = std::ptr::null_mut();
                    ((self.handle)(i, &mut d) == 0).then_some((i, d))
                }).collect()
            }
        }

        pub fn gpus(&self) -> Vec<Gpu> {
            self.devices().into_iter().map(|(index, d)| {
                let mut buf = [0u8; 96];
                let mut mem = Memory::default();
                // SAFETY: as above; the name buffer's length is passed in.
                let (name_ok, mem_ok) = unsafe { ((self.name)(d, buf.as_mut_ptr(), buf.len() as u32) == 0, (self.memory)(d, &mut mem) == 0) };
                let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
                let name = if name_ok { String::from_utf8_lossy(&buf[..len]).into_owned() } else { "NVIDIA GPU".into() };
                Gpu { index, name, vendor: Vendor::Nvidia, memory_mb: mem_ok.then_some((mem.total / (1024 * 1024)) as u32) }
            }).collect()
        }

        pub fn temps(&self) -> HashMap<u32, u32> {
            self.devices().into_iter().filter_map(|(i, d)| {
                let mut t = 0;
                // SAFETY: as above. Sensor 0 = the GPU die.
                (unsafe { (self.temperature)(d, 0, &mut t) } == 0).then_some((i, t))
            }).collect()
        }
    }
}

/// The antivirus that's active, by name, from Windows Security Center (read-only). None when it
/// can't be read in a few seconds; the window then says "your antivirus".
pub fn active_antivirus() -> Option<String> {
    #[cfg(windows)]
    {
        // WMI on its own short-lived thread, so a slow Security Center never holds up the app.
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || { let _ = tx.send(antivirus_products()); });
        rx.recv_timeout(Duration::from_secs(5)).ok().and_then(|p| hashcoin_core::antivirus::active(&p))
    }
    #[cfg(not(windows))]
    None
}

#[cfg(windows)]
fn antivirus_products() -> Vec<hashcoin_core::antivirus::Product> {
    #[derive(serde::Deserialize)]
    #[serde(rename = "AntiVirusProduct", rename_all = "camelCase")]
    struct Row { display_name: String, product_state: u32 }
    let Ok(con) = wmi::WMIConnection::with_namespace_path(r"root\SecurityCenter2") else { return Vec::new() };
    con.query::<Row>().map(|rows| rows.into_iter().map(|r| hashcoin_core::antivirus::Product { name: r.display_name, state: r.product_state }).collect()).unwrap_or_default()
}

/// Time since the last keyboard or mouse input in this user's session.
#[cfg(windows)]
pub fn idle_time() -> Option<Duration> {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    // SAFETY: plain Win32 calls with a correctly sized struct.
    unsafe {
        if GetLastInputInfo(&mut info) == 0 { return None; }
        Some(Duration::from_millis(GetTickCount().wrapping_sub(info.dwTime) as u64))
    }
}

/// The file name of the app filling the screen, if one does: Windows' own "busy / fullscreen
/// Direct3D" state, or a foreground window covering its whole monitor (borderless fullscreen games).
#[cfg(windows)]
pub fn fullscreen_app() -> Option<String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    if !fills_screen() { return None; }
    // SAFETY: plain Win32 calls with a valid out-parameter.
    let pid = unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(GetForegroundWindow(), &mut pid);
        pid
    };
    if pid == 0 { return None; }
    process_name(pid)
}

#[cfg(windows)]
fn fills_screen() -> bool {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows_sys::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN};
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect, IsIconic};
    // SAFETY: plain Win32 calls; every out-parameter is a correctly sized local.
    unsafe {
        let mut state = 0;
        if SHQueryUserNotificationState(&mut state) == 0 && [QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN, QUNS_PRESENTATION_MODE].contains(&state) {
            return true;
        }
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() || IsIconic(hwnd) != 0 { return false; }
        // The desktop and the taskbar cover the screen too, but aren't an app.
        let mut class = [0u16; 64];
        let n = GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32).max(0) as usize;
        let class = String::from_utf16_lossy(&class[..n]);
        if ["Progman", "WorkerW", "Shell_TrayWnd", "Windows.UI.Core.CoreWindow"].contains(&class.as_str()) { return false; }
        let mut win: RECT = std::mem::zeroed();
        if GetWindowRect(hwnd, &mut win) == 0 { return false; }
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), &mut mi) == 0 { return false; }
        let m = mi.rcMonitor;
        win.left <= m.left && win.top <= m.top && win.right >= m.right && win.bottom >= m.bottom
    }
}

/// How much of the graphics card each process uses: Windows' "GPU Engine" counters, the numbers
/// Task Manager shows per app, for every card and vendor. Rates need two samples, so the query stays
/// open and each `sample` reports the average since the previous one (one mining tick).
#[cfg(windows)]
pub struct GpuWatch { query: *mut core::ffi::c_void, counter: *mut core::ffi::c_void }

// SAFETY: PDH query handles aren't tied to the thread that opened them; the runtime only ever uses
// this from one thread at a time (behind its mutex).
#[cfg(windows)]
unsafe impl Send for GpuWatch {}

#[cfg(windows)]
impl GpuWatch {
    /// None when the counters aren't available (turned off on some PCs).
    pub fn new() -> Option<Self> {
        use windows_sys::Win32::System::Performance::{PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhOpenQueryW};
        let path: Vec<u16> = r"\GPU Engine(*)\Utilization Percentage".encode_utf16().chain(Some(0)).collect();
        // SAFETY: plain PDH calls with valid out-pointers; the query is closed on every failure.
        unsafe {
            let mut query = std::ptr::null_mut();
            if PdhOpenQueryW(std::ptr::null(), 0, &mut query) != 0 { return None; }
            let mut counter = std::ptr::null_mut();
            if PdhAddEnglishCounterW(query, path.as_ptr(), 0, &mut counter) != 0 {
                PdhCloseQuery(query);
                return None;
            }
            PdhCollectQueryData(query);
            Some(Self { query, counter })
        }
    }

    /// Each engine counter's name and its use (%) since the last call. None if reading failed.
    pub fn sample(&mut self) -> Option<Vec<(String, f64)>> {
        use windows_sys::Win32::System::Performance::{
            PdhCollectQueryData, PdhGetFormattedCounterArrayW, PDH_CSTATUS_NEW_DATA, PDH_CSTATUS_VALID_DATA, PDH_FMT_COUNTERVALUE_ITEM_W,
            PDH_FMT_DOUBLE, PDH_MORE_DATA,
        };
        const NOCAP100: u32 = 0x8000;
        // SAFETY: the buffer is sized as PDH asks, aligned for the item structs, and outlives the
        // name pointers read from it.
        unsafe {
            if PdhCollectQueryData(self.query) != 0 { return None; }
            let (mut bytes, mut count) = (0u32, 0u32);
            let r = PdhGetFormattedCounterArrayW(self.counter, PDH_FMT_DOUBLE | NOCAP100, &mut bytes, &mut count, std::ptr::null_mut());
            if r != PDH_MORE_DATA || bytes == 0 { return if r == 0 { Some(Vec::new()) } else { None }; }
            let item = std::mem::size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>();
            let mut buf: Vec<PDH_FMT_COUNTERVALUE_ITEM_W> = Vec::with_capacity((bytes as usize).div_ceil(item));
            if PdhGetFormattedCounterArrayW(self.counter, PDH_FMT_DOUBLE | NOCAP100, &mut bytes, &mut count, buf.as_mut_ptr()) != 0 { return None; }
            buf.set_len(count as usize);
            Some(buf.iter().filter(|i| i.FmtValue.CStatus == PDH_CSTATUS_VALID_DATA || i.FmtValue.CStatus == PDH_CSTATUS_NEW_DATA).map(|i| {
                let mut n = 0;
                while *i.szName.add(n) != 0 { n += 1; }
                (String::from_utf16_lossy(std::slice::from_raw_parts(i.szName, n)), i.FmtValue.Anonymous.doubleValue)
            }).collect())
        }
    }
}

#[cfg(windows)]
impl Drop for GpuWatch {
    fn drop(&mut self) {
        // SAFETY: the query was opened in `new` and is closed once.
        unsafe { windows_sys::Win32::System::Performance::PdhCloseQuery(self.query); }
    }
}

/// A running process's file name ("game.exe"), if Windows lets this user read it.
#[cfg(windows)]
pub fn process_name(pid: u32) -> Option<String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    // SAFETY: plain Win32 calls; the handle is closed before returning.
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() { return None; }
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len) != 0;
        CloseHandle(h);
        if !ok { return None; }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        path.rsplit(['\\', '/']).next().map(str::to_string)
    }
}

#[cfg(not(windows))]
pub struct GpuWatch;

#[cfg(not(windows))]
impl GpuWatch {
    pub fn new() -> Option<Self> { None }
    pub fn sample(&mut self) -> Option<Vec<(String, f64)>> { None }
}

#[cfg(not(windows))]
pub fn process_name(_pid: u32) -> Option<String> { None }

#[cfg(not(windows))]
pub fn idle_time() -> Option<Duration> { None }

#[cfg(not(windows))]
pub fn fullscreen_app() -> Option<String> { None }

#[cfg(all(test, windows))]
mod tests {
    /// Reads this PC's real cards (whatever they are); checks the calls work and agree.
    #[test]
    fn reads_cards_without_helper_programs() {
        let nvidia = super::nvidia_gpus();
        let temps = super::nvidia_temps();
        for g in &nvidia {
            assert!(!g.name.is_empty());
            assert!(temps.get(&g.index).is_some_and(|&t| t > 0 && t < 120), "{g:?} {temps:?}");
        }
        // Security Center answers with this PC's antivirus (or nothing); either way, quickly.
        let t = std::time::Instant::now();
        let av = super::active_antivirus();
        assert!(t.elapsed() < std::time::Duration::from_secs(6));
        eprintln!("active antivirus: {av:?}");
        let adapters = super::display_adapters();
        for g in &nvidia {
            assert!(adapters.iter().any(|a| a == &g.name), "DirectX and NVML name {} the same: {adapters:?}", g.name);
        }
    }

    /// The GPU counters read, and pick up a process that starts using the card after the watch
    /// opened (a game launched while mining). Set HASH_TEST_GPU_EXE to a program that uses the GPU
    /// (with HASH_TEST_GPU_ARGS) to check the second part; without it, only the reading is checked.
    #[test]
    fn watches_gpu_use_per_process() {
        let mut w = super::GpuWatch::new().expect("GPU Engine counters available");
        std::thread::sleep(std::time::Duration::from_millis(500));
        let first = w.sample().expect("sample");
        assert!(first.iter().all(|(n, _)| n.starts_with("pid_")), "{:?}", first.first());
        std::thread::sleep(std::time::Duration::from_secs(3));
        let mut busy: Vec<_> = hashcoin_core::safety::gpu_use_by_pid(&w.sample().unwrap()).into_iter().collect();
        busy.sort_by(|a, b| b.1.total_cmp(&a.1));
        for (pid, used) in busy.iter().take(6) { eprintln!("{used:5.1}%  {pid}  {:?}", super::process_name(*pid)); }
        let Ok(exe) = std::env::var("HASH_TEST_GPU_EXE") else { return };
        let args: Vec<String> = std::env::var("HASH_TEST_GPU_ARGS").unwrap_or_default().split(' ').filter(|a| !a.is_empty()).map(String::from).collect();
        let mut child = std::process::Command::new(exe).args(args).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn().unwrap();
        let pid = child.id();
        let mut seen = false;
        for _ in 0..10 {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let tag = format!("pid_{pid}_");
            let mine: Vec<_> = w.sample().unwrap().into_iter().filter(|(n, _)| n.starts_with(&tag)).collect();
            eprintln!("pid {pid}: {mine:?}");
            if mine.iter().any(|(_, u)| *u > 0.0) { seen = true; break; }
        }
        let _ = child.kill();
        assert!(seen, "a process started after the watch opened shows up");
        assert_eq!(super::process_name(std::process::id()).map(|n| n.to_lowercase().ends_with(".exe")), Some(true));
    }
}
