import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Plus, Trash2, Upload, Music, Sun, Moon, Pencil, RefreshCw, GripVertical, ClipboardPaste } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, useDragControls } from 'framer-motion';

const generateId = () => Math.random().toString(36).substring(2, 9);

// Helper to grab a random placeholder album color/image
const placeholderGradients = [
  'linear-gradient(135deg, #f5af19 0%, #f12711 100%)',
];

const SortableSongItem = ({ song, activeSongId, onSelect, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    boxShadow: isDragging ? '0px 10px 20px rgba(0,0,0,0.3)' : 'none',
    position: 'relative',
    zIndex: isDragging ? 99 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`setlist-item ${song.id === activeSongId ? 'active' : ''}`}
      onClick={() => onSelect(song.id)}
    >
      <div
        className="drag-handle"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={20} />
      </div>
      <div className="item-cover" style={{ background: song.albumArt ? 'transparent' : song.gradient }}>
        {song.albumArt ? (
          <img src={song.albumArt} alt="Cover" />
        ) : (
          <Music size={20} style={{ opacity: 0.5, color: '#fff' }} />
        )}
      </div>
      <div className="item-info">
        <div className="item-title">{song.title}</div>
        <div className="item-bpm">{song.bpm} BPM</div>
      </div>
      <div className="item-actions">
        <button className="delete-btn" onClick={(e) => onDelete(song.id, e)}>
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
};

const MetronomeApp = () => {
  const [songs, setSongs] = useState(() => {
    try {
      const item = localStorage.getItem('spotify_setlist');
      return item ? JSON.parse(item) : [
        { id: generateId(), title: "Welcome to ProBeat", bpm: 120, gradient: placeholderGradients[0], albumArt: null }
      ];
    } catch {
      return [{ id: generateId(), title: "New Song", bpm: 120, gradient: placeholderGradients[0], albumArt: null }];
    }
  });

  const [isLightMode, setIsLightMode] = useState(() => {
    try {
      return localStorage.getItem('probeat_theme') === 'light';
    } catch {
      return false;
    }
  });

  const [isEditing, setIsEditing] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const dragControls = useDragControls();

  const [activeSongId, setActiveSongId] = useState(() => songs[0]?.id);
  const activeSong = songs.find(s => s.id === activeSongId) || songs[0];

  const [isRunning, setIsRunning] = useState(false);

  // Persist Setlist
  useEffect(() => {
    localStorage.setItem('spotify_setlist', JSON.stringify(songs));
  }, [songs]);

  // Persist Theme
  useEffect(() => {
    localStorage.setItem('probeat_theme', isLightMode ? 'light' : 'dark');
    if (isLightMode) {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [isLightMode]);

  const bpmRef = useRef(120);

  // Keep the ref in sync with state for accurate timing
  useEffect(() => {
    if (activeSong) {
      bpmRef.current = activeSong.bpm;
    }
  }, [activeSong?.bpm]);


  const updateActiveSong = (updates) => {
    setSongs(prev => prev.map(s => s.id === activeSongId ? { ...s, ...updates } : s));
  };

  // Album Artwork Fetching Hook (Debounced 1.5s)
  useEffect(() => {
    if (!activeSong) return;
    const title = activeSong.title?.trim();
    if (!title || title.startsWith('New ') || title.startsWith('Imported')) return;

    if (!activeSong.albumArt) {
      const timeoutId = setTimeout(async () => {
        try {
          const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&media=music&entity=song&limit=1`);
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            const url = data.results[0].artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg');
            setSongs(prev => prev.map(s => s.id === activeSong.id ? { ...s, albumArt: url } : s));
          }
        } catch (e) {
          console.error("Failed to fetch artwork from iTunes", e);
        }
      }, 1500);

      return () => clearTimeout(timeoutId);
    }
  }, [activeSong?.title, activeSong?.albumArt, activeSong?.id]);


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

    const isDownbeat = beatNumber.current === 0;
    osc.frequency.value = isDownbeat ? 1200 : 800;
    osc.type = "sine";

    gainNode.gain.setValueAtTime(1, audioContext.current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.current.currentTime + 0.1);

    osc.start(audioContext.current.currentTime);
    osc.stop(audioContext.current.currentTime + 0.1);

    beatNumber.current = (beatNumber.current + 1) % 4;
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
      beatNumber.current = 0;
      expected = Date.now();
      scheduleNote();
    } else {
      if (timerID.current) clearTimeout(timerID.current);
    }

    return () => {
      if (timerID.current) clearTimeout(timerID.current);
    };
  }, [isRunning]);


  const handleBpmChange = (newBpm) => {
    updateActiveSong({ bpm: newBpm });
  };

  const handleTitleChange = (newTitle) => {
    updateActiveSong({ title: newTitle, albumArt: null }); // allow re-fetch
  };

  const addNewSong = () => {
    const newSong = {
      id: generateId(),
      title: "",
      bpm: 120,
      gradient: placeholderGradients[Math.floor(Math.random() * placeholderGradients.length)],
      albumArt: null
    };
    setSongs(prev => [...prev, newSong]);
    setActiveSongId(newSong.id);
    setIsRunning(false);
    setIsEditing(true);
    setIsDrawerOpen(true); // Open drawer instantly to type
  };

  const deleteSong = (id, e) => {
    e.stopPropagation();
    setSongs(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (filtered.length === 0) {
        return [{ id: generateId(), title: "New Song", bpm: 120, gradient: placeholderGradients[0], albumArt: null }];
      }
      if (id === activeSongId) {
        setActiveSongId(filtered[0].id);
        setIsRunning(false);
      }
      return filtered;
    });
  };

  const parseSongsFromText = (text) => {
    const lines = text.split(/\r?\n/);
    const parsedSongs = lines.reduce((acc, line) => {
      let title = "Imported Song";
      let bpm = 120;
      let found = false;

      const matchEnd = line.match(/^(.*?)[^\w]*(\d{2,3})(?:\s*bpm)?$/i);
      if (matchEnd) {
        title = matchEnd[1].trim();
        bpm = parseInt(matchEnd[2], 10);
        found = true;
      } else {
        const matchStart = line.match(/^(\d{2,3})(?:\s*bpm)?[^\w]*(.*?)$/i);
        if (matchStart) {
          bpm = parseInt(matchStart[1], 10);
          title = matchStart[2].trim();
          found = true;
        }
      }

      if (found && bpm >= 40 && bpm <= 300) {
        acc.push({
          id: generateId(),
          title: title || "Imported Song",
          bpm,
          gradient: placeholderGradients[Math.floor(Math.random() * placeholderGradients.length)],
          albumArt: null
        });
      }
      return acc;
    }, []);

    if (parsedSongs.length > 0) {
      setSongs(prev => [...prev, ...parsedSongs]);
      alert(`Successfully imported ${parsedSongs.length} songs.`);
      setIsDrawerOpen(true);
    } else {
      alert("Couldn't parse any readable 'Song Title - BPM' pairs.");
    }
  };

  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      parseSongsFromText(event.target.result);
    };
    reader.readAsText(file);
    e.target.value = null; // reset
  };

  const handleClipboardPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) throw new Error("Clipboard is empty.");
      parseSongsFromText(text);
    } catch (err) {
      alert("Please copy a setlist block of text to your clipboard first and grant clipboard permission if prompted!");
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setSongs((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  if (!activeSong) return null;

  const bgVisual = activeSong.albumArt ? `url(${activeSong.albumArt})` : (activeSong.gradient.includes('gradient') ? activeSong.gradient : 'none');
  const drawerDragDistance = typeof window !== 'undefined' ? (window.innerHeight - 260) : 400;

  return (
    <>
      <div
        className="blur-bg"
        style={{ backgroundImage: bgVisual }}
      />
      <div className="blur-overlay" />

      <div className="app-wrapper">
        <header className="top-nav">
          <div className="logo-text">ProBeat Setlist</div>
          <div className="header-actions">
            <button className="icon-btn" onClick={() => window.location.reload()} title="Refresh App">
              <RefreshCw size={20} />
            </button>
            <button className="icon-btn" onClick={() => setIsLightMode(!isLightMode)} title="Toggle Theme">
              {isLightMode ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <button className="icon-btn" onClick={handleClipboardPaste} title="Paste from Clipboard">
              <ClipboardPaste size={20} />
            </button>
            <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Import from Document">
              <Upload size={20} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden-input"
              onChange={handleFileUpload}
            />
          </div>
        </header>

        <section className="now-playing">
          <div className="album-art-container" style={{ background: activeSong.albumArt ? 'transparent' : activeSong.gradient }}>
            {activeSong.albumArt ? (
              <img src={activeSong.albumArt} alt={activeSong.title} className="album-art-img" />
            ) : (
              <Music size={64} className="album-placeholder" style={{ opacity: 0.5 }} />
            )}
          </div>

          <div className="song-info">
            <input
              value={activeSong.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="title-input"
              readOnly={!isEditing}
              placeholder="Song Title..."
              autoFocus={isEditing}
            />
            <div className="bpm-row">
              <div className={`bpm-number ${isRunning ? 'pulse' : ''}`}>{activeSong.bpm}</div>
              <div className="bpm-label-wrapper">
                <div className="bpm-label">BPM</div>
                <button
                  className={`edit-btn ${isEditing ? 'active' : ''}`}
                  onClick={() => setIsEditing(!isEditing)}
                >
                  <Pencil size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className={`slider-container ${!isEditing ? 'disabled' : ''}`}>
            <input
              type="range"
              min="40"
              max="250"
              value={activeSong.bpm}
              onChange={(e) => handleBpmChange(parseInt(e.target.value))}
              disabled={!isEditing}
            />
          </div>

          <div className="main-controls">
            <button
              className={`play-pause-btn ${isRunning ? 'playing' : ''}`}
              onClick={() => setIsRunning(!isRunning)}
            >
              {isRunning ? <Square fill="currentColor" /> : <Play fill="currentColor" />}
            </button>
          </div>
        </section>

        <motion.section
          className="setlist-section"
          drag="y"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: -drawerDragDistance, bottom: 0 }}
          dragElastic={0.1}
          onDragEnd={(e, info) => {
            if (info.offset.y < -50 || info.velocity.y < -500) {
              setIsDrawerOpen(true);
            } else if (info.offset.y > 50 || info.velocity.y > 500) {
              setIsDrawerOpen(false);
            }
          }}
          animate={{ y: isDrawerOpen ? -drawerDragDistance : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {/* A large hit area around the visual pill to easily grab */}
          <div
            style={{ padding: '0 2rem 1rem 2rem', cursor: 'grab', touchAction: 'none' }}
            onPointerDown={(e) => dragControls.start(e)}
          >
            <div className="drawer-pill" />
          </div>

          <div className="setlist-header">
            <h2>Up Next</h2>
            <div className="add-song-row">
              <button className="add-btn" onClick={addNewSong}>
                <Plus size={16} /> Add
              </button>
            </div>
          </div>

          <div className="setlist-list">
            {songs.length === 0 ? (
              <div className="empty-state">No songs in Setlist</div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={songs.map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {songs.map((song) => (
                    <SortableSongItem
                      key={song.id}
                      song={song}
                      activeSongId={activeSongId}
                      onSelect={(id) => {
                        setActiveSongId(id);
                        setIsEditing(false); // Reset lock state when clicking a new song
                        setIsRunning(false);
                      }}
                      onDelete={deleteSong}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </motion.section>
      </div>
    </>
  );
};

export default MetronomeApp;
