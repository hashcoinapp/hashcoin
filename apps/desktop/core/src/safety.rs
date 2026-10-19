//! When to pause mining: a card running hot, the user at the PC ("mine only when idle"), or a game
//! (or any other app) using the graphics card. The shell measures; this decides, so it can be tested
//! anywhere.

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq)]
pub struct SafetySettings {
    /// Pause a card at this temperature (°C)...
    pub temp_limit_c: u32,
    /// ...and resume once it has cooled to this.
    pub temp_resume_c: u32,
    /// Mine only while nobody uses the keyboard or mouse.
    pub only_when_idle: bool,
    /// How long without input counts as idle.
    pub idle_after: Duration,
    /// Pause while a game or another app uses the graphics card, so it gets the whole card.
    pub pause_for_games: bool,
}

impl Default for SafetySettings {
    fn default() -> Self {
        Self { temp_limit_c: 83, temp_resume_c: 75, only_when_idle: false, idle_after: Duration::from_secs(300), pause_for_games: true }
    }
}

/// What the shell measured this tick.
#[derive(Debug, Clone, Default)]
pub struct Readings {
    /// Time since the last keyboard or mouse input. None when unknown (never pauses).
    pub idle: Option<Duration>,
    /// A game or another app is using the graphics card (see `gaming`).
    pub gaming: bool,
    /// Temperature per GPU slot, where the app can read it (NVIDIA, through NVML).
    pub temps: HashMap<u32, u32>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Pause {
    Hot { temp_c: u32, resume_c: u32 },
    Gaming,
    InUse,
}

impl Pause {
    pub fn describe(&self) -> String {
        match self {
            Pause::Hot { temp_c, resume_c } => format!("Paused at {temp_c} °C, resumes at {resume_c} °C"),
            Pause::Gaming => "Paused while a game or app uses the GPU".into(),
            Pause::InUse => "Paused while you use the PC".into(),
        }
    }
}

/// When the miner already pauses hot cards itself (ForgeMiner's --temp-limit), the app only steps in
/// this many degrees above the limit, as a backstop. Otherwise both would fight over the same card.
pub const BACKSTOP_MARGIN_C: u32 = 4;

/// After a game stops using the card, wait this long before mining again, so alt-tabbing or a
/// loading screen doesn't restart the miners.
pub const GAME_GRACE: Duration = Duration::from_secs(30);

/// A process using at least this share (%) of the card's 3D or compute engines, averaged over a few
/// seconds, counts as a game (or a render, or AI work). Idle desktops, browsing and video stay
/// well under it; a running game sits far above it, even capped at 60 FPS.
pub const GAME_GPU_USE: f64 = 15.0;

/// Programs that use the card a little all the time but aren't games: the Windows compositor, app
/// web views (this app's own window among them) and recording software (so recording the screen
/// doesn't pause mining).
pub const NOT_GAMES: &[&str] = &["dwm.exe", "msedgewebview2.exe", "obs64.exe", "obs32.exe"];

/// Windows' "GPU Engine" counters, one per process and engine, named like
/// `pid_1234_luid_0x0_0xD1A8_phys_0_eng_0_engtype_3D`, with the share (%) of time that engine spent
/// on the process's work. Sums each process's 3D and compute use; copy and video engines don't count
/// (a video playing in a browser uses those).
pub fn gpu_use_by_pid(samples: &[(String, f64)]) -> HashMap<u32, f64> {
    let mut by_pid = HashMap::new();
    for (name, value) in samples {
        let Some(pid) = name.strip_prefix("pid_").and_then(|r| r.split('_').next()).and_then(|p| p.parse::<u32>().ok()) else { continue };
        let Some(engine) = name.rsplit_once("engtype_").map(|(_, e)| e) else { continue };
        let counts = engine == "3D" || engine == "Cuda" || engine.starts_with("Compute") || engine.starts_with("Graphics");
        if counts && value.is_finite() && *value > 0.0 { *by_pid.entry(pid).or_insert(0.0) += value; }
    }
    by_pid
}

/// Whether anything but the miners (`ignore`) uses the card like a game. `name_of(pid)` gives a
/// process's file name, looked up only for the few busy ones; one Windows won't name is a protected
/// system process, never a game.
pub fn gaming(by_pid: &HashMap<u32, f64>, ignore: &[u32], name_of: impl Fn(u32) -> Option<String>) -> bool {
    by_pid.iter().any(|(pid, &used)| {
        used >= GAME_GPU_USE && !ignore.contains(pid)
            && name_of(*pid).is_some_and(|n| !NOT_GAMES.iter().any(|x| n.eq_ignore_ascii_case(x)))
    })
}

/// Fullscreen apps that are for watching, not playing: a fullscreen video doesn't need the card, so
/// it doesn't pause mining. Any other fullscreen app counts as a game, however light (a 2D game
/// barely shows in the GPU counters but still loses frames to a busy card).
pub const WATCHING_APPS: &[&str] = &[
    "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "opera_gx.exe", "vivaldi.exe", "arc.exe",
    "vlc.exe", "mpc-hc64.exe", "mpc-be64.exe", "potplayermini64.exe", "mpv.exe", "wmplayer.exe", "Microsoft.Media.Player.exe",
    "ApplicationFrameHost.exe", "POWERPNT.EXE", "Teams.exe", "ms-teams.exe", "Zoom.exe", "Discord.exe",
];

/// Whether the app filling the screen (by file name) counts as a game.
pub fn fullscreen_is_game(name: &str) -> bool {
    !WATCHING_APPS.iter().chain(NOT_GAMES).any(|x| name.eq_ignore_ascii_case(x))
}

#[derive(Debug, Default)]
pub struct Guard {
    hot: HashSet<u32>,
    last_temp: HashMap<u32, u32>,
    gaming_until: Option<Instant>,
    in_use: bool,
}

impl Guard {
    /// Take this tick's readings. `miner_pauses_hot(slot)` says whether the miner running on that
    /// slot has its own temperature limit.
    pub fn update(&mut self, s: &SafetySettings, r: &Readings, miner_pauses_hot: impl Fn(u32) -> bool, now: Instant) {
        for (&slot, &t) in &r.temps {
            self.last_temp.insert(slot, t);
            let limit = s.temp_limit_c + if miner_pauses_hot(slot) { BACKSTOP_MARGIN_C } else { 0 };
            if t >= limit {
                self.hot.insert(slot);
            } else if t <= s.temp_resume_c {
                self.hot.remove(&slot);
            }
        }
        if s.pause_for_games && r.gaming {
            self.gaming_until = Some(now + GAME_GRACE);
        } else if !s.pause_for_games || self.gaming_until.is_some_and(|t| now >= t) {
            self.gaming_until = None;
        }
        self.in_use = s.only_when_idle && r.idle.is_some_and(|d| d < s.idle_after);
    }

    /// Why this GPU should not mine right now, if it shouldn't. A hot card comes first.
    pub fn pause_for(&self, slot: u32, s: &SafetySettings) -> Option<Pause> {
        if self.hot.contains(&slot) {
            return Some(Pause::Hot { temp_c: self.last_temp.get(&slot).copied().unwrap_or(s.temp_limit_c), resume_c: s.temp_resume_c });
        }
        if self.gaming_until.is_some() { return Some(Pause::Gaming); }
        if self.in_use { return Some(Pause::InUse); }
        None
    }

    /// The last temperature read for a slot.
    pub fn temp(&self, slot: u32) -> Option<u32> { self.last_temp.get(&slot).copied() }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temps(t: &[(u32, u32)]) -> Readings { Readings { temps: t.iter().copied().collect(), ..Default::default() } }

    #[test]
    fn pauses_a_hot_card_until_it_cools() {
        let s = SafetySettings::default();
        let (mut g, now) = (Guard::default(), Instant::now());
        g.update(&s, &temps(&[(0, 82), (1, 70)]), |_| false, now);
        assert_eq!(g.pause_for(0, &s), None);
        g.update(&s, &temps(&[(0, 83)]), |_| false, now);
        assert_eq!(g.pause_for(0, &s), Some(Pause::Hot { temp_c: 83, resume_c: 75 }));
        assert_eq!(g.pause_for(1, &s), None, "only the hot card pauses");
        g.update(&s, &temps(&[(0, 78)]), |_| false, now);
        assert!(g.pause_for(0, &s).is_some(), "stays paused until it reaches the resume temperature");
        g.update(&s, &temps(&[(0, 75)]), |_| false, now);
        assert_eq!(g.pause_for(0, &s), None);
    }

    #[test]
    fn only_backstops_a_miner_with_its_own_limit() {
        let s = SafetySettings::default();
        let mut g = Guard::default();
        g.update(&s, &temps(&[(0, 85)]), |_| true, Instant::now());
        assert_eq!(g.pause_for(0, &s), None, "the miner handles 83-86 itself");
        g.update(&s, &temps(&[(0, 87)]), |_| true, Instant::now());
        assert!(g.pause_for(0, &s).is_some());
    }

    #[test]
    fn mines_only_when_idle_if_asked() {
        let mut s = SafetySettings::default();
        let mut g = Guard::default();
        let busy = Readings { idle: Some(Duration::from_secs(10)), ..Default::default() };
        let away = Readings { idle: Some(Duration::from_secs(301)), ..Default::default() };
        g.update(&s, &busy, |_| false, Instant::now());
        assert_eq!(g.pause_for(0, &s), None, "off by default");
        s.only_when_idle = true;
        g.update(&s, &busy, |_| false, Instant::now());
        assert_eq!(g.pause_for(0, &s), Some(Pause::InUse));
        g.update(&s, &away, |_| false, Instant::now());
        assert_eq!(g.pause_for(0, &s), None);
    }

    #[test]
    fn pauses_for_games_with_a_grace_period() {
        let s = SafetySettings::default();
        assert!(s.pause_for_games, "on by default");
        let (mut g, t0) = (Guard::default(), Instant::now());
        let game = Readings { gaming: true, ..Default::default() };
        g.update(&s, &game, |_| false, t0);
        assert_eq!(g.pause_for(0, &s), Some(Pause::Gaming));
        assert_eq!(g.pause_for(1, &s), Some(Pause::Gaming), "every card steps back");
        g.update(&s, &Readings::default(), |_| false, t0 + Duration::from_secs(5));
        assert_eq!(g.pause_for(0, &s), Some(Pause::Gaming), "a quick alt-tab doesn't restart the miner");
        g.update(&s, &Readings::default(), |_| false, t0 + GAME_GRACE);
        assert_eq!(g.pause_for(0, &s), None);
        // Turning the option off resumes at once.
        let off = SafetySettings { pause_for_games: false, ..Default::default() };
        g.update(&s, &game, |_| false, t0);
        g.update(&off, &game, |_| false, t0);
        assert_eq!(g.pause_for(0, &off), None);
    }

    fn sample(name: &str, v: f64) -> (String, f64) { (name.to_string(), v) }

    #[test]
    fn sums_3d_and_compute_use_per_process() {
        let by_pid = gpu_use_by_pid(&[
            sample("pid_100_luid_0x00000000_0x0000D1A8_phys_0_eng_0_engtype_3D", 40.0),
            sample("pid_100_luid_0x00000000_0x0000D1A8_phys_0_eng_3_engtype_Compute_0", 5.0),
            sample("pid_100_luid_0x00000000_0x0000D1A8_phys_0_eng_5_engtype_Copy", 30.0),
            sample("pid_200_luid_0x00000000_0x0000D1A8_phys_0_eng_9_engtype_VideoDecode", 60.0),
            sample("pid_300_luid_0x00000000_0x0000D1A8_phys_0_eng_1_engtype_Cuda", 99.0),
            sample("garbage", 50.0),
        ]);
        assert_eq!(by_pid.get(&100), Some(&45.0));
        assert_eq!(by_pid.get(&200), None, "video decoding isn't gaming");
        assert_eq!(by_pid.get(&300), Some(&99.0));
    }

    #[test]
    fn a_busy_app_is_a_game_unless_it_is_a_miner_or_listed() {
        let by_pid: HashMap<u32, f64> = [(10, 95.0), (20, 3.0), (30, 40.0)].into_iter().collect();
        let names = |pid| Some(match pid { 10 => "ForgeMiner.exe", 30 => "DWM.EXE", _ => "x.exe" }.to_string());
        assert!(!gaming(&by_pid, &[10], names), "the miner itself and the compositor don't count");
        assert!(gaming(&by_pid, &[], names), "anything else that busy does");
        let light: HashMap<u32, f64> = [(20, 14.0)].into_iter().collect();
        assert!(!gaming(&light, &[], names), "light use (a video, the desktop) doesn't pause");
        assert!(!gaming(&by_pid, &[10], |_| None), "a process Windows won't name is a system one");
    }

    #[test]
    fn a_fullscreen_game_counts_but_a_fullscreen_video_does_not() {
        assert!(fullscreen_is_game("GeometryDash.exe"));
        assert!(!fullscreen_is_game("CHROME.EXE"));
        assert!(!fullscreen_is_game("vlc.exe"));
    }
}
