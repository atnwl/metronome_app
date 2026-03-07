import React, { useState, useEffect, useRef } from 'react';

const MetronomeApp = () => {
  const [bpm, setBpm] = useState(120);
  const [songTitle, setSongTitle] = useState("New Song");
  const [isRunning, setIsRunning] = useState(false);
  const [setlist, setSetlist] = useState(() => {
    try {
      const item = localStorage.getItem('setlist');
      return item ? JSON.parse(item) : {};
    } catch {
      return {};
    }
  });

  const bpmRef = useRef(bpm);

  // Keep the ref in sync with state for accurate timing without re-triggering effects
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  const audioContext = useRef(null);
  const timerID = useRef(null);
  const beatNumber = useRef(0);

  // Play a click sound
  const playClick = () => {
    if (!audioContext.current) return;
    const osc = audioContext.current.createOscillator();
    const gainNode = audioContext.current.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioContext.current.destination);

    // Higher pitch for downbeat
    const isDownbeat = beatNumber.current === 0;
    osc.frequency.value = isDownbeat ? 1200 : 800;
    osc.type = "sine";

    gainNode.gain.setValueAtTime(1, audioContext.current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.current.currentTime + 0.1);

    osc.start(audioContext.current.currentTime);
    osc.stop(audioContext.current.currentTime + 0.1);

    beatNumber.current = (beatNumber.current + 1) % 4; // 4/4 time signature
  };

  useEffect(() => {
    let expected = Date.now();

    const scheduleNote = () => {
      playClick();
      const secondsPerBeat = 60.0 / bpmRef.current;
      expected += secondsPerBeat * 1000;
      const delay = expected - Date.now();
      timerID.current = setTimeout(scheduleNote, delay > 0 ? delay : 0);
    };

    if (isRunning) {
      if (!audioContext.current || audioContext.current.state === 'closed') {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext.current = new AudioContext();
      }
      if (audioContext.current.state === 'suspended') {
        audioContext.current.resume();
      }
      beatNumber.current = 0; // Reset beat on play
      expected = Date.now();
      scheduleNote();
    } else {
      if (timerID.current) clearTimeout(timerID.current);
    }

    return () => {
      if (timerID.current) clearTimeout(timerID.current);
    };
  }, [isRunning]); // ONLY re-run on start/stop

  const saveSong = () => {
    if (!songTitle.trim()) return;
    const newList = { ...setlist, [songTitle]: bpm };
    setSetlist(newList);
    localStorage.setItem('setlist', JSON.stringify(newList));
  };

  const loadSong = (title, savedBpm) => {
    setSongTitle(title);
    setBpm(savedBpm);
  };

  return (
    <>
      <div className="background-orbs">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
      </div>

      <div className="app-container">
        <h1 className="app-title">ProBeat Pro</h1>

        <input
          className="input-field"
          value={songTitle}
          onChange={(e) => setSongTitle(e.target.value)}
          placeholder="Enter Song Title..."
        />

        <div className="bpm-display-wrapper">
          <div className={`bpm-number ${isRunning ? 'pulse' : ''}`}>{bpm}</div>
          <div className="bpm-label">BPM</div>
        </div>

        <div className="slider-container">
          <input
            type="range"
            min="40"
            max="250"
            value={bpm}
            className="bpm-slider"
            onChange={(e) => setBpm(parseInt(e.target.value))}
          />
        </div>

        <div className="controls-row">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`btn ${isRunning ? 'btn-stop' : 'btn-start'}`}
            title={isRunning ? "Stop Metronome" : "Start Metronome"}
          >
            {isRunning ? "Stop" : "Start"}
          </button>

          <button
            onClick={saveSong}
            className="btn btn-save"
            title="Save preset to Setlist"
          >
            Save
          </button>
        </div>

        <div className="setlist-container">
          <h2 className="setlist-title">My Setlist</h2>

          <div className="setlist-list">
            {Object.keys(setlist).length === 0 ? (
              <div className="empty-state">No saved presets yet</div>
            ) : (
              Object.entries(setlist).map(([title, savedBpm]) => (
                <div
                  key={title}
                  className="setlist-item"
                  onClick={() => loadSong(title, savedBpm)}
                >
                  <span className="item-title" title={title}>{title}</span>
                  <span className="item-bpm">{savedBpm}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default MetronomeApp;
