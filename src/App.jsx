import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Plus, Trash2, Upload, Music, Sun, Moon, Pencil, RefreshCw, GripVertical, ClipboardPaste, ListX, MoreVertical, HelpCircle } from 'lucide-react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, useDragControls } from 'framer-motion';

const generateId = () => Math.random().toString(36).substring(2, 9);

// Helper to grab a random placeholder album color/image
const placeholderGradients = [
  'linear-gradient(135deg, #f5af19 0%, #f12711 100%)',
];

const SongPreview = ({ song, isActive, isNext }) => {
  return (
    <div className={`setlist-item ${isActive ? 'active' : ''} ${isNext ? 'next-preview' : ''}`} style={{ cursor: 'default' }}>
      <div className="item-info">
        <div className="item-title">{song.title || "Untitled Song"}</div>
        <div className="item-bpm">{song.bpm} BPM</div>
      </div>
    </div>
  );
};

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
      <div className="item-info">
        <div className="item-title">{song.title || "Untitled Song"}</div>
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dragControls = useDragControls();
  const listRef = useRef(null);
  const scrollTimeoutRef = useRef(null);

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

  const audioContext = useRef(null);
  const timerID = useRef(null);
  const beatNumber = useRef(0);

  const launchTutorial = () => {
    setIsMenuOpen(false);
    const driverObj = driver({
      showProgress: true,
      animate: true,
      steps: [
        { element: '.play-pause-btn', popover: { title: 'Playback', description: 'Start and stop the metronome pulse right here.', align: 'center' } },
        { element: '.song-info', popover: { title: 'Song Details', description: 'Tap to change the title or adjust the BPM.', side: "top", align: 'start' } },
        { element: '.add-btn-main', popover: { title: 'Add Song', description: 'Quickly add a new track to your setlist.', side: "left", align: 'center' } },
        { element: '.tour-menu-btn', popover: { title: 'Toolbar Menu', description: 'Menu for imports, theme, and clearing the list.', side: 'bottom', align: 'end' } },
        { element: '.drawer-hit-area', popover: { title: 'Setlist Drawer', description: 'Swipe up to see and reorder your full setlist.', side: 'top', align: 'center' } },
      ]
    });
    driverObj.drive();
    localStorage.setItem('probeat_tour_completed', 'true');
  };

  useEffect(() => {
    const isCompleted = localStorage.getItem('probeat_tour_completed') === 'true';
    if (!isCompleted) {
      setTimeout(() => {
        launchTutorial();
      }, 1000);
    }
  }, []);

  // Play a click sound
  const playClick = () => {
    if (!audioContext.current) return;
    const osc = audioContext.current.createOscillator();
    const gainNode = audioContext.current.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioContext.current.destination);

    osc.frequency.value = 1000; // Constant frequency for all beats
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
    const song = songs.find(s => s.id === id);
    if (!window.confirm(`Are you sure you want to delete "${song?.title || 'this song'}"?`)) return;

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

  const clearAllSongs = () => {
    if (window.confirm("Are you sure you want to completely clear your Setlist?")) {
      const defaultSong = { id: generateId(), title: "New Song", bpm: 120, gradient: placeholderGradients[0], albumArt: null };
      setSongs([defaultSong]);
      setActiveSongId(defaultSong.id);
      setIsRunning(false);
      setIsDrawerOpen(false);
    }
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

  const bgVisual = (activeSong.gradient.includes('gradient') ? activeSong.gradient : 'var(--bg-color)');
  const drawerDragDistance = typeof window !== 'undefined' ? (window.innerHeight - 350) : 400;

  return (
    <div onClick={() => isMenuOpen && setIsMenuOpen(false)}>
      <div className="landscape-warning">
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📱</div>
        <h2>Please rotate to Portrait</h2>
        <p style={{ opacity: 0.6, marginTop: '0.5rem' }}>ProBeat is optimized for vertical use.</p>
      </div>
      <div
        className="blur-bg"
        style={{ backgroundImage: bgVisual }}
      />
      <div className="blur-overlay" />

      <div className="app-wrapper">
        <header className="top-nav">
          <div className="logo-text">ProBeat Setlist</div>
          <div className="header-actions" style={{ position: 'relative' }}>
            <button className="icon-btn tour-menu-btn" onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }} title="Menu">
              <MoreVertical size={20} />
            </button>

            {isMenuOpen && (
              <div className="dropdown-menu" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setIsLightMode(!isLightMode); setIsMenuOpen(false); }}>
                  {isLightMode ? <Moon size={16} /> : <Sun size={16} />} Toggle Theme
                </button>
                <button onClick={() => { handleClipboardPaste(); setIsMenuOpen(false); }}>
                  <ClipboardPaste size={16} /> Paste Setlist
                </button>
                <button onClick={() => { fileInputRef.current?.click(); setIsMenuOpen(false); }}>
                  <Upload size={16} /> Upload Setlist
                </button>
                <div className="dropdown-divider" />
                <button onClick={launchTutorial}>
                  <HelpCircle size={16} /> Launch Tutorial
                </button>
                <button onClick={() => window.location.reload()}>
                  <RefreshCw size={16} /> Refresh App
                </button>
                <div className="dropdown-divider" />
                <button className="danger-text" onClick={() => { clearAllSongs(); setIsMenuOpen(false); }}>
                  <ListX size={16} /> Clear Setlist
                </button>
              </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden-input"
              onChange={handleFileUpload}
            />
          </div>
        </header>

        <section className="now-playing">
          <button
            className={`main-play-btn ${isRunning ? 'playing' : ''}`}
            onClick={() => setIsRunning(!isRunning)}
          >
            {isRunning ? <Square fill="currentColor" size={48} /> : <Play fill="currentColor" size={48} />}
          </button>

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
              <div className="bpm-number-group">
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
              <button className="add-btn-main" onClick={addNewSong} title="Add New Song">
                <Plus size={20} />
              </button>
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
          <div
            className="drawer-hit-area"
            style={{
              width: '100%',
              height: '50px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'grab',
              touchAction: 'none'
            }}
            onPointerDown={(e) => dragControls.start(e)}
          >
            <div className="drawer-pill" style={{ height: '6px', width: '60px' }} />
          </div>

          <div
            className="setlist-list"
            ref={listRef}
            onPointerDown={(e) => {
              // Allow dragging the drawer by touching the background gaps of the list
              if (e.target.classList.contains('setlist-list') ||
                e.target.classList.contains('minimized-preview') ||
                e.target.classList.contains('empty-state')) {
                dragControls.start(e);
              }
            }}
          >
            {!isDrawerOpen ? (
              // Hard-coded 2 song view when minimized
              <div className="minimized-preview">
                <SongPreview song={activeSong} isActive={true} />
                {songs.map((s, idx) => {
                  const currentIdx = songs.findIndex(item => item.id === activeSongId);
                  if (idx > currentIdx && idx <= currentIdx + 2) {
                    return <SongPreview key={s.id} song={s} isNext={true} />;
                  }
                  return null;
                })}
              </div>
            ) : (
              // Full sortable list when expanded
              songs.length === 0 ? (
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
                          setIsEditing(false);
                          setIsRunning(false);
                          setIsDrawerOpen(false); // Auto-minimize on selection
                        }}
                        onDelete={deleteSong}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )
            )}
          </div>
        </motion.section>
      </div>
    </div>
  );
};

export default MetronomeApp;
