//! How well a card is mining: its live hashrate (read from the miner's local API) against what that
//! card model should reach on the coin (a public benchmark the server sends with the assignment).

use serde::Serialize;
use std::collections::VecDeque;
use std::time::{Duration, Instant};

/// Hashrate is averaged over this window, so the number doesn't jump with every reading.
pub const WINDOW: Duration = Duration::from_secs(60);
/// A miner needs this long after starting (tuning kernels, first jobs) before its speed means much.
pub const WARM_UP: Duration = Duration::from_secs(90);

/// Efficiency tiers, by live hashrate as a share of the benchmark.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier { Great, Good, Ok, Bad, Terrible }

impl Tier {
    /// 100%+ great, 80-100 good, 60-80 ok, 30-60 bad, under 30 terrible.
    pub fn of(percent: f64) -> Tier {
        match percent {
            p if p >= 100.0 => Tier::Great,
            p if p >= 80.0 => Tier::Good,
            p if p >= 60.0 => Tier::Ok,
            p if p >= 30.0 => Tier::Bad,
            _ => Tier::Terrible,
        }
    }
}

/// The live hashrate of one running miner.
#[derive(Debug)]
pub struct Meter {
    /// The miner process this measures; a new process starts a new meter.
    pub pid: u32,
    started: Instant,
    samples: VecDeque<(Instant, f64)>,
}

impl Meter {
    pub fn new(pid: u32, started: Instant) -> Self { Self { pid, started, samples: VecDeque::new() } }

    pub fn add(&mut self, now: Instant, hashrate: f64) {
        if !hashrate.is_finite() || hashrate < 0.0 { return; }
        self.samples.push_back((now, hashrate));
        while self.samples.front().is_some_and(|(t, _)| now.duration_since(*t) > WINDOW) { self.samples.pop_front(); }
    }

    /// Still warming up: too early to judge the speed.
    pub fn warming(&self, now: Instant) -> bool { now.duration_since(self.started) < WARM_UP }

    /// The average over the last minute, once there is a reading.
    pub fn hashrate(&self) -> Option<f64> {
        if self.samples.is_empty() { return None; }
        Some(self.samples.iter().map(|(_, h)| h).sum::<f64>() / self.samples.len() as f64)
    }

    /// Live hashrate as a percentage of `expected`, once warmed up.
    pub fn percent(&self, expected: Option<f64>, now: Instant) -> Option<f64> {
        let expected = expected.filter(|e| *e > 0.0)?;
        if self.warming(now) { return None; }
        Some(self.hashrate()? / expected * 100.0)
    }
}

/// ForgeMiner's `GET /summary` (its local dashboard's data): `{"hashrate": <H/s>, ...}`.
pub fn forge_summary_hashrate(body: &str) -> Option<f64> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    v.get("hashrate")?.as_f64().filter(|h| h.is_finite() && *h >= 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tiers_follow_the_bands() {
        assert_eq!(Tier::of(112.0), Tier::Great);
        assert_eq!(Tier::of(100.0), Tier::Great);
        assert_eq!(Tier::of(85.0), Tier::Good);
        assert_eq!(Tier::of(80.0), Tier::Good);
        assert_eq!(Tier::of(79.9), Tier::Ok);
        assert_eq!(Tier::of(60.0), Tier::Ok);
        assert_eq!(Tier::of(45.0), Tier::Bad);
        assert_eq!(Tier::of(29.0), Tier::Terrible);
        assert_eq!(Tier::of(0.0), Tier::Terrible);
    }

    #[test]
    fn averages_the_last_minute_after_warming_up() {
        let t0 = Instant::now();
        let mut m = Meter::new(7, t0);
        m.add(t0, 50e12);
        assert_eq!(m.percent(Some(100e12), t0), None, "too early to judge");
        assert_eq!(m.hashrate(), Some(50e12), "but the speed shows");
        let late = t0 + WARM_UP + Duration::from_secs(10);
        m.add(late - Duration::from_secs(5), 110e12);
        m.add(late, 130e12);
        assert_eq!(m.hashrate(), Some(120e12), "the warm-up reading has aged out");
        assert_eq!(m.percent(Some(150e12), late), Some(80.0));
        assert_eq!(m.percent(None, late), None, "no benchmark, no percentage");
    }

    #[test]
    fn reads_forgeminer_summary() {
        let body = r#"{"algorithm":"pearlhash","version":"1.8.8","hashrate":112390000000000.0,"hashrate_1h":1.1e14,"gpus":[{"gpu":0,"hashrate":112390000000000.0}]}"#;
        assert_eq!(forge_summary_hashrate(body), Some(112.39e12));
        assert_eq!(forge_summary_hashrate("not json"), None);
        assert_eq!(forge_summary_hashrate(r#"{"hashrate":"fast"}"#), None);
    }
}
