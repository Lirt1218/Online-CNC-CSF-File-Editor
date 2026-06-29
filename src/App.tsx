import React, { useState, useMemo, useRef, useEffect } from "react";
import { 
  Upload, 
  Download, 
  Search, 
  Plus, 
  Trash2, 
  Undo2, 
  Redo2, 
  FileText, 
  Globe, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Info, 
  Copy, 
  Check, 
  FileCheck,
  RotateCcw,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  parseCsf, 
  compileCsf, 
  LANGUAGE_LIST, 
  LANGUAGES,
  CsfFile, 
  CsfLabel 
} from "./utils/csf";

// Standard Red Alert 2 & Yuri's Revenge sample strings for instant preview
const SAMPLE_CSF_LABELS: CsfLabel[] = [
  { id: "s1", name: "GUI:Loading", value: "Loading...", extraValue: "" },
  { id: "s2", name: "TXT:PLAY", value: "Play Game", extraValue: "" },
  { id: "s3", name: "Name:E1", value: "GI", extraValue: "" },
  { id: "s4", name: "Description:E1", value: "Standard Allied defensive infantry. Armed with a machine gun, they can deploy sandbags for extra protection and firepower.", extraValue: "" },
  { id: "s5", name: "Name:E2", value: "Conscript", extraValue: "" },
  { id: "s6", name: "Description:E2", value: "Cheap and highly loyal Soviet infantry armed with a submachine gun. Excellent in large numbers.", extraValue: "" },
  { id: "s7", name: "Name:APOC", value: "Apocalypse Tank", extraValue: "" },
  { id: "s8", name: "Description:APOC", value: "Soviet heavy assault tank. Armed with dual 120mm cannons and Mammoth anti-aircraft missile pods. Self-repairs.", extraValue: "" },
  { id: "s9", name: "Name:YURI", value: "Yuri Clone", extraValue: "" },
  { id: "s10", name: "Description:YURI", value: "Tactical psychic unit. Capable of telepathically controlling almost any enemy ground unit or vehicle.", extraValue: "" },
  { id: "s11", name: "Name:CHRONO", value: "Chrono Legionnaire", extraValue: "" },
  { id: "s12", name: "Description:CHRONO", value: "Special Allied assault trooper. Warps across the battlefield and phased-out targets from the space-time continuum.", extraValue: "" },
  { id: "s13", name: "STT:PowerLow", value: "Power Low! Radar, base defenses, and factory production speeds are severely disabled.", extraValue: "" },
  { id: "s14", name: "TXT:VICTORY", value: "VICTORY", extraValue: "" },
  { id: "s15", name: "TXT:DEFEAT", value: "DEFEAT", extraValue: "" },
  { id: "s16", name: "Name:SHK", value: "Tesla Trooper", extraValue: "" },
  { id: "s17", name: "Description:SHK", value: "Heavy armored Soviet infantry immune to running over. Discharges deadly electric bolts that can power up Tesla Coils.", extraValue: "Yuri's Revenge Expansion" },
  { id: "s18", name: "GUI:MainMenu", value: "Main Menu", extraValue: "" },
  { id: "s19", name: "TXT:OK", value: "OK", extraValue: "" },
  { id: "s20", name: "TXT:CANCEL", value: "Cancel", extraValue: "" }
];

export default function App() {
  const [csfFile, setCsfFile] = useState<CsfFile | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchIn, setSearchIn] = useState<"both" | "name" | "value">("both");
  const [filterHasExtra, setFilterHasExtra] = useState<boolean>(false);
  const [filterModifiedOnly, setFilterModifiedOnly] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"categorized" | "flat">("categorized");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 30; // Highly efficient render budget

  // Modification logs
  const [modifiedIds, setModifiedIds] = useState<Set<string>>(new Set());
  const [newLabelCounter, setNewLabelCounter] = useState<number>(1);

  // Undo / Redo history stack
  const [history, setHistory] = useState<CsfLabel[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Success / Error alerts
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Custom confirmation modal state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Language for the UI itself (English / Chinese)
  const [uiLang, setUiLang] = useState<"zh" | "en">((): "zh" | "en" => {
    try {
      const saved = localStorage.getItem("csf_editor_ui_lang");
      if (saved === "zh" || saved === "en") return saved;
    } catch (e) {}
    return "zh"; // Default to Chinese
  });

  const toggleUiLang = () => {
    const next = uiLang === "zh" ? "en" : "zh";
    setUiLang(next);
    try {
      localStorage.setItem("csf_editor_ui_lang", next);
    } catch (e) {}
    triggerNotification("info", next === "zh" ? "界面语言已切换为中文" : "UI language switched to English");
  };

  const t = (en: string, zh: string) => {
    return uiLang === "zh" ? zh : en;
  };

  // References
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trigger brief notification banner
  const triggerNotification = (type: "success" | "error" | "info", text: string) => {
    setNotification({ type, text });
    setTimeout(() => {
      setNotification(prev => prev?.text === text ? null : prev);
    }, 4000);
  };

  // Set initial state from loaded labels
  const loadFileState = (file: CsfFile, name: string) => {
    setCsfFile(file);
    setFileName(name);
    setSelectedLabelId(file.labels.length > 0 ? file.labels[0].id : null);
    setModifiedIds(new Set());
    setSearchQuery("");
    setCurrentPage(1);
    setExpandedCategories({});
    
    // Reset history stack
    setHistory([JSON.parse(JSON.stringify(file.labels))]);
    setHistoryIndex(0);
    triggerNotification("success", t(`Successfully loaded file: ${name} with ${file.labels.length} strings`, `成功载入文件：${name}，共 ${file.labels.length} 条字条`));
  };

  // Load sample Red Alert 2 strings
  const loadSampleData = () => {
    const sampleFile: CsfFile = {
      version: 3,
      language: 0, // US English
      labels: JSON.parse(JSON.stringify(SAMPLE_CSF_LABELS))
    };
    loadFileState(sampleFile, "ra2_sample.csf");
  };

  // Create an empty fresh CSF file
  const createNewFile = () => {
    const emptyFile: CsfFile = {
      version: 3,
      language: 0,
      labels: [
        { id: "new_1", name: "TXT:NEW_LABEL", value: "New Value", extraValue: "" }
      ]
    };
    loadFileState(emptyFile, "unnamed.csf");
  };

  // Binary .csf / .json parser handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    
    try {
      if (extension === ".csf") {
        const arrayBuffer = await file.arrayBuffer();
        const parsed = parseCsf(arrayBuffer);
        loadFileState(parsed, file.name);
      } else if (extension === ".json") {
        const text = await file.text();
        const parsedJson = JSON.parse(text);
        
        // Validate JSON structure loosely
        if (parsedJson && Array.isArray(parsedJson.labels)) {
          const labels: CsfLabel[] = parsedJson.labels.map((item: any, idx: number) => ({
            id: item.id || `lbl_${idx}_${Date.now()}`,
            name: String(item.name || `TXT:UNKNOWN_${idx}`),
            value: String(item.value || ""),
            extraValue: String(item.extraValue || "")
          }));
          
          loadFileState({
            version: typeof parsedJson.version === "number" ? parsedJson.version : 3,
            language: typeof parsedJson.language === "number" ? parsedJson.language : 0,
            labels
          }, file.name);
        } else {
          throw new Error(t("JSON must contain a top-level 'labels' array of objects.", "JSON 文件必须包含顶层 'labels' 标签数组。"));
        }
      } else {
        throw new Error(t("Unsupported file format. Please upload a .csf or .json file.", "不支持的文件格式。请上传 .csf 或 .json 文件。"));
      }
    } catch (err: any) {
      console.error(err);
      triggerNotification("error", t(`Parse failed: ${err.message || err}`, `解析失败：${err.message || err}`));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Commit current labels list to history stack for Undo/Redo
  const commitToHistory = (newLabels: CsfLabel[]) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(JSON.parse(JSON.stringify(newLabels)));
    
    // Limit stack size to 50 items
    if (nextHistory.length > 50) {
      nextHistory.shift();
    }
    
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  // Undo trigger
  const handleUndo = () => {
    if (historyIndex > 0 && csfFile) {
      const prevIndex = historyIndex - 1;
      const prevLabels = history[prevIndex];
      setHistoryIndex(prevIndex);
      setCsfFile({
        ...csfFile,
        labels: JSON.parse(JSON.stringify(prevLabels))
      });
      triggerNotification("info", t("Undo action applied", "撤销操作已应用"));
    }
  };

  // Redo trigger
  const handleRedo = () => {
    if (historyIndex < history.length - 1 && csfFile) {
      const nextIndex = historyIndex + 1;
      const nextLabels = history[nextIndex];
      setHistoryIndex(nextIndex);
      setCsfFile({
        ...csfFile,
        labels: JSON.parse(JSON.stringify(nextLabels))
      });
      triggerNotification("info", t("Redo action applied", "重做操作已应用"));
    }
  };

  // Helper: edit a property of the active label in real-time
  const handleUpdateActiveLabel = (updatedFields: Partial<Omit<CsfLabel, "id">>) => {
    if (!csfFile || !selectedLabelId) return;

    let targetUpdated = false;
    const nextLabels = csfFile.labels.map(lbl => {
      if (lbl.id === selectedLabelId) {
        targetUpdated = true;
        // Check if actually modified compared to original stack baseline
        const originalLabels = history[0] || [];
        const originalMatch = originalLabels.find(orig => orig.name === lbl.name || orig.id === lbl.id);
        
        const hasChanges = 
          (updatedFields.name !== undefined && updatedFields.name !== originalMatch?.name) ||
          (updatedFields.value !== undefined && updatedFields.value !== originalMatch?.value) ||
          (updatedFields.extraValue !== undefined && updatedFields.extraValue !== originalMatch?.extraValue);

        if (hasChanges) {
          modifiedIds.add(selectedLabelId);
        }

        return {
          ...lbl,
          ...updatedFields
        };
      }
      return lbl;
    });

    if (targetUpdated) {
      setCsfFile({
        ...csfFile,
        labels: nextLabels
      });
      // Update history in background
      commitToHistory(nextLabels);
    }
  };

  // Handle language change
  const handleLanguageChange = (langId: number) => {
    if (!csfFile) return;
    const nextFile = { ...csfFile, language: langId };
    setCsfFile(nextFile);
    commitToHistory(nextFile.labels);
    triggerNotification("success", t(`Language set to ${LANGUAGES[langId] || "Unknown"}`, `语言标识已变更为 ${LANGUAGES[langId] || "未知"}`));
  };

  // Handle version change
  const handleVersionChange = (version: number) => {
    if (!csfFile) return;
    const nextFile = { ...csfFile, version };
    setCsfFile(nextFile);
    commitToHistory(nextFile.labels);
    triggerNotification("success", t(`Version code updated to ${version}`, `版本号已变更为 ${version}`));
  };

  // Add a brand new string label
  const handleAddLabel = () => {
    if (!csfFile) return;
    
    const count = newLabelCounter;
    setNewLabelCounter(count + 1);

    const newLabel: CsfLabel = {
      id: `new_lbl_${Date.now()}_${count}`,
      name: `TXT:NEW_LABEL_${count}`,
      value: "New translation string description",
      extraValue: ""
    };

    const nextLabels = [newLabel, ...csfFile.labels];
    setCsfFile({
      ...csfFile,
      labels: nextLabels
    });
    
    // Select the new label immediately
    setSelectedLabelId(newLabel.id);
    modifiedIds.add(newLabel.id);
    setModifiedIds(new Set(modifiedIds));
    
    // Reset page to 1 so the user can see it instantly
    setCurrentPage(1);
    
    commitToHistory(nextLabels);
    triggerNotification("success", t(`Added new label ${newLabel.name}`, `已新增字符串 ${newLabel.name}`));
  };

  // Duplicate the selected label
  const handleDuplicateLabel = (target: CsfLabel) => {
    if (!csfFile) return;

    const count = newLabelCounter;
    setNewLabelCounter(count + 1);

    const dupLabel: CsfLabel = {
      id: `dup_lbl_${Date.now()}_${count}`,
      name: `${target.name}_COPY`,
      value: target.value,
      extraValue: target.extraValue || ""
    };

    const targetIndex = csfFile.labels.findIndex(lbl => lbl.id === target.id);
    const nextLabels = [...csfFile.labels];
    
    // Insert immediately below target
    if (targetIndex !== -1) {
      nextLabels.splice(targetIndex + 1, 0, dupLabel);
    } else {
      nextLabels.unshift(dupLabel);
    }

    setCsfFile({
      ...csfFile,
      labels: nextLabels
    });

    setSelectedLabelId(dupLabel.id);
    modifiedIds.add(dupLabel.id);
    setModifiedIds(new Set(modifiedIds));

    commitToHistory(nextLabels);
    triggerNotification("success", t(`Duplicated label as ${dupLabel.name}`, `已克隆复制字条为 ${dupLabel.name}`));
  };

  // Delete specific label
  const handleDeleteLabel = (labelId: string, labelName: string) => {
    if (!csfFile) return;

    const targetIndex = csfFile.labels.findIndex(lbl => lbl.id === labelId);
    const nextLabels = csfFile.labels.filter(lbl => lbl.id !== labelId);
    
    setCsfFile({
      ...csfFile,
      labels: nextLabels
    });

    // Auto-select another label nearby if deleted active one
    if (selectedLabelId === labelId) {
      if (nextLabels.length > 0) {
        const nextSelectedIndex = Math.min(targetIndex, nextLabels.length - 1);
        setSelectedLabelId(nextLabels[nextSelectedIndex].id);
      } else {
        setSelectedLabelId(null);
      }
    }

    modifiedIds.delete(labelId);
    setModifiedIds(new Set(modifiedIds));

    commitToHistory(nextLabels);
    triggerNotification("info", t(`Removed label ${labelName}`, `已移除字条 ${labelName}`));
  };

  // Export as Binary CSF file
  const handleExportCsf = () => {
    if (!csfFile) return;

    try {
      const bytes = compileCsf(csfFile);
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = url;
      
      // Ensure file name ends with .csf
      let outName = fileName || "ra2_edited.csf";
      if (!outName.toLowerCase().endsWith(".csf")) {
        const dotIdx = outName.lastIndexOf(".");
        if (dotIdx !== -1) {
          outName = outName.substring(0, dotIdx) + ".csf";
        } else {
          outName = outName + ".csf";
        }
      }

      link.download = outName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      triggerNotification("success", t(`Successfully exported binary CSF file: ${outName}`, `成功编译并导出二进制 CSF 文件：${outName}`));
    } catch (err: any) {
      console.error(err);
      triggerNotification("error", t(`Compilation failed: ${err.message || err}`, `编译导出失败：${err.message || err}`));
    }
  };

  // Export as JSON backup
  const handleExportJson = () => {
    if (!csfFile) return;

    try {
      const dataStr = JSON.stringify(csfFile, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      
      let outName = fileName || "ra2_edited.csf";
      const dotIdx = outName.lastIndexOf(".");
      if (dotIdx !== -1) {
        outName = outName.substring(0, dotIdx) + ".json";
      } else {
        outName = outName + ".json";
      }

      link.download = outName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      triggerNotification("success", t(`Successfully exported JSON file: ${outName}`, `成功导出 JSON 备份文件：${outName}`));
    } catch (err: any) {
      console.error(err);
      triggerNotification("error", t(`JSON generation failed: ${err.message || err}`, `JSON 导出失败：${err.message || err}`));
    }
  };

  // Clean loaded states and restart
  const handleReset = () => {
    showConfirm(
      t("Close File", "关闭文件"),
      t(
        "Are you sure you want to close this file? Any unsaved changes will be lost.",
        "您确定要关闭当前文件吗？所有未导出的修改都将丢失。"
      ),
      () => {
        setCsfFile(null);
        setFileName("");
        setSelectedLabelId(null);
        setModifiedIds(new Set());
        setHistory([]);
        setHistoryIndex(-1);
        setSearchQuery("");
        setCurrentPage(1);
      }
    );
  };

  // Find currently active label object
  const activeLabel = useMemo(() => {
    if (!csfFile || !selectedLabelId) return null;
    return csfFile.labels.find(lbl => lbl.id === selectedLabelId) || null;
  }, [csfFile, selectedLabelId]);

  // Compute filtered list based on query, search flags, and filters
  const filteredLabels = useMemo(() => {
    if (!csfFile) return [];

    const query = searchQuery.toLowerCase().trim();
    
    return csfFile.labels.filter(label => {
      // 1. Text Search filter
      let textMatch = true;
      if (query.length > 0) {
        const nameMatch = label.name.toLowerCase().includes(query);
        const valMatch = label.value.toLowerCase().includes(query);
        
        if (searchIn === "name") {
          textMatch = nameMatch;
        } else if (searchIn === "value") {
          textMatch = valMatch;
        } else {
          textMatch = nameMatch || valMatch;
        }
      }

      // 2. Extra values filter
      const extraMatch = !filterHasExtra || (!!label.extraValue && label.extraValue.trim().length > 0);

      // 3. Modified only filter
      const modifiedMatch = !filterModifiedOnly || modifiedIds.has(label.id);

      return textMatch && extraMatch && modifiedMatch;
    });
  }, [csfFile, searchQuery, searchIn, filterHasExtra, filterModifiedOnly, modifiedIds]);

  // Parse category prefix from string key (e.g. GUI:Name -> GUI, TXT:PLAY -> TXT, theme:intro -> THEME)
  const getLabelCategory = (name: string): string => {
    const colonIdx = name.indexOf(":");
    if (colonIdx !== -1) {
      const prefix = name.substring(0, colonIdx).trim();
      if (prefix && !/^\d+$/.test(prefix)) {
        return prefix.toUpperCase();
      }
    }
    return "OTHER";
  };

  // Group filtered strings by parsed categories
  const labelsByCategory = useMemo(() => {
    const groups: Record<string, CsfLabel[]> = {};
    filteredLabels.forEach(lbl => {
      const cat = getLabelCategory(lbl.name);
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(lbl);
    });
    return groups;
  }, [filteredLabels]);

  // Sort category keys alphabetically but keep OTHER at bottom
  const sortedCategories = useMemo(() => {
    const categories = Object.keys(labelsByCategory);
    categories.sort((a, b) => {
      if (a === "OTHER") return 1;
      if (b === "OTHER") return -1;
      return a.localeCompare(b);
    });
    return categories;
  }, [labelsByCategory]);

  const handleToggleCategory = (cat: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }));
  };

  const handleExpandAllCategories = () => {
    const next: Record<string, boolean> = {};
    sortedCategories.forEach(cat => {
      next[cat] = true;
    });
    setExpandedCategories(next);
  };

  const handleCollapseAllCategories = () => {
    const next: Record<string, boolean> = {};
    sortedCategories.forEach(cat => {
      next[cat] = false;
    });
    setExpandedCategories(next);
  };

  // Handle auto-reset to page 1 on search filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, searchIn, filterHasExtra, filterModifiedOnly]);

  // Computed Pagination list
  const totalPages = Math.max(1, Math.ceil(filteredLabels.length / pageSize));
  
  const paginatedLabels = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredLabels.slice(startIndex, startIndex + pageSize);
  }, [filteredLabels, currentPage]);

  // Safe page navigation
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // Keyboard controls for walking through strings (ArrowUp/ArrowDown to change active label!)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!csfFile || filteredLabels.length === 0 || !selectedLabelId) return;

      // Do not navigate with arrows if typing in a text editing area
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
        // Exception: allow navigating via Ctrl + ArrowUp/ArrowDown
        if (!e.ctrlKey) return;
      }

      const currentIndex = filteredLabels.findIndex(lbl => lbl.id === selectedLabelId);
      if (currentIndex === -1) return;

      if (e.key === "ArrowDown" || (e.key === "j" && e.ctrlKey)) {
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, filteredLabels.length - 1);
        setSelectedLabelId(filteredLabels[nextIndex].id);
        
        // Auto navigate page if index exceeds visible page scope
        const expectedPage = Math.floor(nextIndex / pageSize) + 1;
        if (expectedPage !== currentPage) {
          setCurrentPage(expectedPage);
        }
      } else if (e.key === "ArrowUp" || (e.key === "k" && e.ctrlKey)) {
        e.preventDefault();
        const prevIndex = Math.max(currentIndex - 1, 0);
        setSelectedLabelId(filteredLabels[prevIndex].id);

        const expectedPage = Math.floor(prevIndex / pageSize) + 1;
        if (expectedPage !== currentPage) {
          setCurrentPage(expectedPage);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [csfFile, filteredLabels, selectedLabelId, currentPage]);

  // Highlight matches text helper
  const renderHighlightedText = (text: string, query: string) => {
    if (!query || !query.trim()) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")})`, "gi"));
    return (
      <span>
        {parts.map((part, index) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={index} className="bg-amber-100 text-amber-950 font-medium px-0.5 rounded-sm">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-slate-50 text-slate-800 font-sans flex flex-col antialiased">
      
      {/* Header Panel */}
      <header className="bg-slate-950 border-b border-slate-800 text-white shadow-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap justify-between items-center gap-4">
          
          {/* Logo Title */}
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 text-slate-950 p-1.5 rounded-md font-bold text-xs tracking-wider flex items-center justify-center font-mono">
              RA2
            </div>
            <div>
              <h1 className="text-lg font-bold font-sans tracking-tight flex items-center gap-2">
                {t("Red Alert 2 CSF Editor", "红警2 CSF 语言包编辑器")}
                <span className="text-xs text-slate-400 font-normal">v1.0</span>
              </h1>
              <p className="text-xs text-slate-400 font-mono hidden sm:block">
                {t("Command & Conquer String Table Modder", "命令与征服 字符串表修改工具")}
              </p>
            </div>
          </div>

          {/* Core File Actions */}
          <div className="flex items-center gap-2">
            
            {/* Language Switcher */}
            <button
              onClick={toggleUiLang}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-850 text-amber-400 hover:text-amber-300 text-xs font-semibold rounded-md transition-all border border-slate-800 font-mono"
              title={t("Switch language (English / 中文)", "切换界面语言 (中文 / 英文)")}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{t("English", "简体中文")}</span>
            </button>

            {/* File upload trigger */}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".csf,.json" 
              className="hidden" 
            />
            
            {csfFile ? (
              <>
                <div className="hidden md:flex items-center gap-3 bg-slate-900 px-3 py-1.5 rounded-md text-xs border border-slate-800 text-slate-300 font-mono">
                  <span>{t("File:", "文件:")} <strong className="text-white">{fileName}</strong></span>
                  <span className="text-slate-600">|</span>
                  <span>{t("Strings:", "字符串数:")} <strong className="text-white">{csfFile.labels.length}</strong></span>
                  {modifiedIds.size > 0 && (
                    <>
                      <span className="text-slate-600">|</span>
                      <span className="flex items-center gap-1 text-amber-400">
                        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
                        {modifiedIds.size} {t("modified", "已修改")}
                      </span>
                    </>
                  )}
                </div>

                {/* Undo / Redo controls */}
                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-md p-0.5">
                  <button
                    onClick={handleUndo}
                    disabled={historyIndex <= 0}
                    title={t("Undo (Ctrl+Z)", "撤销 (Ctrl+Z)")}
                    className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent rounded-sm transition-all"
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={historyIndex >= history.length - 1}
                    title={t("Redo (Ctrl+Y)", "重做 (Ctrl+Y)")}
                    className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent rounded-sm transition-all"
                  >
                    <Redo2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Download Menu Button */}
                <div className="flex items-center gap-1 bg-amber-500 rounded-md p-0.5">
                  <button 
                    onClick={handleExportCsf}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-sm transition-all"
                    title={t("Compile & Download RA2 string binary", "编译并下载红警2 CSF 二进制文件")}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t("Export .csf", "导出 .csf")}
                  </button>
                  <span className="h-4 w-[1px] bg-amber-700"></span>
                  <button 
                    onClick={handleExportJson}
                    className="px-2 py-1.5 bg-transparent hover:bg-amber-600 text-slate-950 font-semibold text-xs rounded-sm transition-all"
                    title={t("Download readable JSON backup", "下载可读的 JSON 备份格式")}
                  >
                    JSON
                  </button>
                </div>

                <button 
                  onClick={handleReset}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded-md transition-all border border-transparent hover:border-slate-800"
                  title={t("Close current file", "关闭当前文件")}
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-md transition-all cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5 text-slate-950 font-bold" />
                  {t("Import File", "导入文件")}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Floating Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-4"
          >
            <div className={`p-3 rounded-lg shadow-lg border text-sm flex items-center justify-between ${
              notification.type === "success" 
                ? "bg-slate-900 text-amber-400 border-amber-500/30" 
                : notification.type === "error" 
                ? "bg-red-950 text-red-200 border-red-500/30" 
                : "bg-slate-900 text-slate-200 border-slate-700"
            }`}>
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0" />
                <span className="font-medium">{notification.text}</span>
              </div>
              <button 
                onClick={() => setNotification(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {confirmDialog.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            {/* Dark Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-slate-950"
            />
            
            {/* Dialog Content */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white border border-slate-200 rounded-xl shadow-2xl max-w-md w-full overflow-hidden z-10 p-5"
            >
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
                <Info className="h-5 w-5 text-amber-500 shrink-0" />
                {confirmDialog.title}
              </h3>
              
              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                {confirmDialog.message}
              </p>
              
              <div className="flex items-center justify-end gap-2.5">
                <button
                  onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                  className="px-3.5 py-1.5 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-md transition-all cursor-pointer"
                >
                  {t("Cancel", "取消")}
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-md transition-all cursor-pointer shadow-sm"
                >
                  {t("Confirm", "确定")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Workspace Frame */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4 md:py-6 flex flex-col min-h-0 gap-4 lg:overflow-hidden">
        
        {!csfFile ? (
          /* Empty / Welcome State */
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm p-8 max-w-3xl mx-auto w-full flex flex-col items-center justify-center text-center my-auto"
          >
            <div className="bg-slate-100 p-4 rounded-full text-slate-500 mb-4 border border-slate-200">
              <FileText className="h-10 w-10 text-amber-500" />
            </div>
            
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
              {t("CSF Online Editor", "csf在线编辑器")}
            </h2>
            <p className="text-slate-500 max-w-lg text-sm mb-8 leading-relaxed">
              {t(".csf files are built-in language text files for Command & Conquer series games (fully known as C&C String File)", ".csf 文件是命令与征服系列游戏内置的语言文本文件（全称为 C&C String File）")}
            </p>

            <div className="w-full max-w-sm">
              {/* Drag n drop card */}
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center gap-3 p-6 border-2 border-dashed border-slate-200 hover:border-amber-400 hover:bg-amber-50/10 rounded-xl transition-all text-center cursor-pointer group"
              >
                <div className="bg-slate-50 p-2.5 rounded-lg text-slate-600 border border-slate-100 group-hover:bg-amber-50 group-hover:text-amber-600 transition-colors">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm">{t("Upload File", "上传语言文件")}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{t("Supports .csf or .json backup", "支持原版 .csf 格式或 JSON 备份")}</p>
                </div>
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 w-full max-w-md text-xs text-slate-400">
              <span className="flex items-center justify-center gap-1.5">
                <FileCheck className="h-3.5 w-3.5" />
                {t("Offline decoding. Files are processed entirely in your browser.", "纯本地解析。所有文件处理均完全在您的浏览器内完成。")}
              </span>
            </div>
          </motion.div>
        ) : (
          /* Active Editor Split Grid Workspace */
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
            
            {/* LEFT COLUMN: Sidebar String Navigator (5/12) */}
            <div className="lg:col-span-5 flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[500px] lg:min-h-0 lg:h-full">
              
              {/* Filter controls panel */}
              <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2">
                
                {/* Text search input */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("Search string keys or translations...", "搜索 Key 键名或翻译文本...")}
                    className="w-full bg-white border border-slate-200 rounded-md py-1.5 pl-9 pr-8 text-sm placeholder-slate-400 focus:outline-none focus:border-amber-500"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Sub-filtering buttons bar */}
                <div className="flex flex-col gap-2 pt-1 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {/* Search Targets */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400 font-mono mr-1">{t("Search In:", "搜索范围:")}</span>
                      <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-md text-slate-600">
                        <button
                          onClick={() => setSearchIn("both")}
                          className={`px-2 py-0.5 rounded-sm text-[11px] ${searchIn === "both" ? "bg-white text-slate-900 font-medium shadow-2xs" : "hover:text-slate-900"}`}
                        >
                          {t("All", "全部")}
                        </button>
                        <button
                          onClick={() => setSearchIn("name")}
                          className={`px-2 py-0.5 rounded-sm text-[11px] ${searchIn === "name" ? "bg-white text-slate-900 font-medium shadow-2xs" : "hover:text-slate-900"}`}
                        >
                          {t("Keys", "键名")}
                        </button>
                        <button
                          onClick={() => setSearchIn("value")}
                          className={`px-2 py-0.5 rounded-sm text-[11px] ${searchIn === "value" ? "bg-white text-slate-900 font-medium shadow-2xs" : "hover:text-slate-900"}`}
                        >
                          {t("Text", "文本")}
                        </button>
                      </div>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400 font-mono mr-1">{t("Layout:", "布局方式:")}</span>
                      <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-md text-slate-600">
                        <button
                          onClick={() => setViewMode("categorized")}
                          className={`px-2 py-0.5 rounded-sm text-[11px] ${viewMode === "categorized" ? "bg-white text-slate-900 font-medium shadow-2xs" : "hover:text-slate-900"}`}
                        >
                          {t("Categories", "自动分类")}
                        </button>
                        <button
                          onClick={() => setViewMode("flat")}
                          className={`px-2 py-0.5 rounded-sm text-[11px] ${viewMode === "flat" ? "bg-white text-slate-900 font-medium shadow-2xs" : "hover:text-slate-900"}`}
                        >
                          {t("Flat List", "完整列表")}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Filter checkboxes & collapse actions */}
                  <div className="flex items-center justify-between border-t border-slate-200/60 pt-1.5 text-slate-600">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 select-none">
                        <input
                          type="checkbox"
                          checked={filterHasExtra}
                          onChange={(e) => setFilterHasExtra(e.target.checked)}
                          className="rounded border-slate-300 text-amber-500 focus:ring-amber-500/30 h-3.5 w-3.5"
                        />
                        <span>{t("With Extra", "含附加值(YR)")}</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 select-none">
                        <input
                          type="checkbox"
                          checked={filterModifiedOnly}
                          onChange={(e) => setFilterModifiedOnly(e.target.checked)}
                          className="rounded border-slate-300 text-amber-500 focus:ring-amber-500/30 h-3.5 w-3.5"
                        />
                        <span>{t("Modified", "已修改")}</span>
                      </label>
                    </div>

                    {viewMode === "categorized" && sortedCategories.length > 0 && (
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                        <button 
                          onClick={handleExpandAllCategories} 
                          className="hover:text-amber-600 hover:underline cursor-pointer"
                        >
                          {t("Expand All", "全部展开")}
                        </button>
                        <span>|</span>
                        <button 
                          onClick={handleCollapseAllCategories} 
                          className="hover:text-amber-600 hover:underline cursor-pointer"
                        >
                          {t("Collapse All", "全部折叠")}
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* Sidebar Quick-Action Buttons */}
              <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs font-mono text-slate-500">
                  {t("Showing", "显示")} <strong>{filteredLabels.length}</strong> {t("of", "/ 共")} {csfFile.labels.length} {t("keys", "个键名")}
                </span>

                <button
                  onClick={handleAddLabel}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-md transition-all shadow-sm"
                  title={t("Insert a brand new label at top", "在列表最上方插入全新字符串字条")}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("Add Label", "新建字条")}
                </button>
              </div>

              {/* Labels list */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {viewMode === "flat" ? (
                  paginatedLabels.length > 0 ? (
                    paginatedLabels.map((lbl, idx) => {
                      const isSelected = selectedLabelId === lbl.id;
                      const isModified = modifiedIds.has(lbl.id);
                      const labelIndex = csfFile.labels.findIndex(l => l.id === lbl.id);
                      
                      return (
                        <div
                          key={lbl.id}
                          onClick={() => setSelectedLabelId(lbl.id)}
                          className={`p-3 text-left transition-all cursor-pointer relative group flex items-start gap-2.5 ${
                            isSelected 
                              ? "bg-amber-50/40 border-l-3 border-amber-500 pl-2.5" 
                              : "hover:bg-slate-50 border-l-3 border-transparent"
                          }`}
                        >
                          {/* Number Indicator */}
                          <span className="text-[10px] font-mono text-slate-400 mt-1 shrink-0 w-8 text-right">
                            #{labelIndex + 1}
                          </span>

                          <div className="flex-1 min-w-0">
                            {/* Label Key */}
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-mono text-xs font-semibold text-slate-900 truncate block">
                                {renderHighlightedText(lbl.name, searchIn !== "value" ? searchQuery : "")}
                              </span>
                              
                              <div className="flex items-center gap-1.5">
                                {lbl.extraValue && (
                                  <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-mono font-medium scale-90 shrink-0">
                                    YR
                                  </span>
                                )}
                                
                                {/* Modified dot */}
                                {isModified && (
                                  <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" title={t("Unsaved edit", "有未保存的修改")}></span>
                                )}
                              </div>
                            </div>

                            {/* Preview String Value */}
                            <p className="text-xs text-slate-500 truncate mt-0.5 pr-4">
                              {lbl.value 
                                ? renderHighlightedText(lbl.value, searchIn !== "name" ? searchQuery : "") 
                                : <span className="italic text-slate-300">{t("Empty translation", "空文本")}</span>}
                            </p>
                          </div>

                          {/* Quick Trash/Delete inside row on hover */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              showConfirm(
                                t("Delete Label", "删除字条"),
                                t(`Are you sure you want to delete label "${lbl.name}"?`, `确定要删除字条 "${lbl.name}" 吗？`),
                                () => handleDeleteLabel(lbl.id, lbl.name)
                              );
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title={t("Delete instantly", "立即删除")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center h-full">
                      <FileText className="h-8 w-8 text-slate-200 mb-2" />
                      <p className="text-sm font-medium">{t("No results found", "没有找到结果")}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t("Adjust or clear search filters", "请尝试调整或清除搜索过滤条件")}</p>
                    </div>
                  )
                ) : (
                  // Categorized (Accordion) View
                  sortedCategories.length > 0 ? (
                    sortedCategories.map((cat) => {
                      const catLabels = labelsByCategory[cat] || [];
                      const isExpanded = !!expandedCategories[cat];

                      return (
                        <div key={cat} className="flex flex-col">
                          {/* Category Header */}
                          <div 
                            onClick={() => handleToggleCategory(cat)}
                            className="flex items-center justify-between px-3 py-2 bg-slate-100/60 border-b border-slate-200/80 cursor-pointer select-none hover:bg-slate-200/40 transition-colors"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-slate-500 shrink-0">
                                {isExpanded ? (
                                  <ChevronRight className="h-3.5 w-3.5 rotate-90 transition-transform duration-150" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150" />
                                )}
                              </span>
                              <span className="font-mono text-xs font-bold text-slate-700 uppercase tracking-wider truncate">
                                {cat}
                              </span>
                              <span className="text-[10px] bg-slate-200/80 text-slate-600 px-1.5 py-0.2 rounded-full font-mono font-semibold">
                                {catLabels.length}
                              </span>
                            </div>
                          </div>

                          {/* Category Items */}
                          {isExpanded && (
                            <div className="divide-y divide-slate-100 bg-white">
                              {catLabels.map((lbl) => {
                                const isSelected = selectedLabelId === lbl.id;
                                const isModified = modifiedIds.has(lbl.id);
                                const labelIndex = csfFile.labels.findIndex(l => l.id === lbl.id);

                                return (
                                  <div
                                    key={lbl.id}
                                    onClick={() => setSelectedLabelId(lbl.id)}
                                    className={`p-3 text-left transition-all cursor-pointer relative group flex items-start gap-2.5 ${
                                      isSelected 
                                        ? "bg-amber-50/40 border-l-3 border-amber-500 pl-2.5" 
                                        : "hover:bg-slate-50 border-l-3 border-transparent"
                                    }`}
                                  >
                                    {/* Number Indicator */}
                                    <span className="text-[10px] font-mono text-slate-400 mt-1 shrink-0 w-8 text-right">
                                      #{labelIndex + 1}
                                    </span>

                                    <div className="flex-1 min-w-0">
                                      {/* Label Key */}
                                      <div className="flex items-center justify-between gap-1.5">
                                        <span className="font-mono text-xs font-semibold text-slate-900 truncate block">
                                          {renderHighlightedText(lbl.name, searchIn !== "value" ? searchQuery : "")}
                                        </span>
                                        
                                        <div className="flex items-center gap-1.5">
                                          {lbl.extraValue && (
                                            <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-mono font-medium scale-90 shrink-0">
                                              YR
                                            </span>
                                          )}
                                          
                                          {/* Modified dot */}
                                          {isModified && (
                                            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" title={t("Unsaved edit", "有未保存的修改")}></span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Preview String Value */}
                                      <p className="text-xs text-slate-500 truncate mt-0.5 pr-4">
                                        {lbl.value 
                                          ? renderHighlightedText(lbl.value, searchIn !== "name" ? searchQuery : "") 
                                          : <span className="italic text-slate-300">{t("Empty translation", "空文本")}</span>}
                                      </p>
                                    </div>

                                    {/* Quick Trash/Delete inside row on hover */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        showConfirm(
                                          t("Delete Label", "删除字条"),
                                          t(`Are you sure you want to delete label "${lbl.name}"?`, `确定要删除字条 "${lbl.name}" 吗？`),
                                          () => handleDeleteLabel(lbl.id, lbl.name)
                                        );
                                      }}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                      title={t("Delete instantly", "立即删除")}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center h-full">
                      <FileText className="h-8 w-8 text-slate-200 mb-2" />
                      <p className="text-sm font-medium">{t("No results found", "没有找到结果")}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t("Adjust or clear search filters", "请尝试调整或清除搜索过滤条件")}</p>
                    </div>
                  )
                )}
              </div>

              {/* Pagination / Count bar */}
              {viewMode === "flat" ? (
                <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 font-mono">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                    className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  
                  <span>
                    {t("Page", "第")} <strong>{currentPage}</strong> {t("of", "页 / 共")} <strong>{totalPages}</strong> {t("pages", "页")}
                  </span>

                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                    className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 font-mono">
                  <span>
                    {t("Categories:", "分类数量:")} <strong>{sortedCategories.length}</strong>
                  </span>
                  <span>
                    {t("Strings matched:", "符合字条数:")} <strong>{filteredLabels.length}</strong>
                  </span>
                </div>
              )}

            </div>

            {/* RIGHT COLUMN: Focused Editing Panel (7/12) */}
            <div className="lg:col-span-7 flex flex-col lg:h-full lg:min-h-0">
              
              <AnimatePresence mode="wait">
                {activeLabel ? (
                  <motion.div
                    key={activeLabel.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col"
                  >
                    
                    {/* Panel Header */}
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-slate-200 text-slate-700 font-mono font-medium px-2 py-0.5 rounded-md">
                          {t("Key:", "键名:")}
                        </span>
                        <h2 className="text-sm font-mono font-bold text-slate-950 truncate max-w-xs sm:max-w-md">
                          {activeLabel.name}
                        </h2>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleDuplicateLabel(activeLabel)}
                          className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-md transition-all cursor-pointer"
                          title={t("Clone this entry", "复制并克隆本条字符串")}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {t("Duplicate", "克隆字条")}
                        </button>
                        <button
                          onClick={() => {
                            showConfirm(
                              t("Delete Label", "删除字条"),
                              t(`Are you sure you want to delete label "${activeLabel.name}"?`, `确定要删除字条 "${activeLabel.name}" 吗？`),
                              () => handleDeleteLabel(activeLabel.id, activeLabel.name)
                            );
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-md transition-all cursor-pointer"
                          title={t("Remove this string", "彻底删除本条字符串")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("Delete", "删除字条")}
                        </button>
                      </div>
                    </div>

                    {/* Active Edit Form Panel */}
                    <div className="p-4 sm:p-5 space-y-4 flex-1 overflow-y-auto">
                      
                      {/* 1. Label Identifier key */}
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider font-mono">
                          {t("Label Identifier (String ID Key)", "键名标识符 (String ID 键名)")}
                        </label>
                        <input
                          type="text"
                          value={activeLabel.name}
                          onChange={(e) => handleUpdateActiveLabel({ name: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-md py-2 px-3 text-sm font-mono font-semibold focus:bg-white focus:outline-none focus:border-amber-500 uppercase"
                          placeholder="e.g. Name:E1"
                        />
                        <p className="text-[10px] text-slate-400">
                          {t("Normally in uppercase (e.g. TXT:PLAY). Unique key used by INI rules to reference game strings.", "通常为大写，用英文冒号分隔分类（例如 GUI:NAME）。这是 rules.ini / art.ini 配置文件调用对应文本的唯一检索标志。")}
                        </p>
                      </div>

                      {/* 2. String Translated Value */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider font-mono">
                            {t("Localized Translation Value", "本地化翻译文本内容")}
                          </label>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {activeLabel.value.length} {t("chars", "字符")}
                          </span>
                        </div>
                        <textarea
                          value={activeLabel.value}
                          onChange={(e) => handleUpdateActiveLabel({ value: e.target.value })}
                          rows={6}
                          className="w-full bg-slate-50 border border-slate-200 rounded-md py-2 px-3 text-sm focus:bg-white focus:outline-none focus:border-amber-500 leading-relaxed font-sans"
                          placeholder={t("Type translated ingame text description...", "在此处输入翻译后要在游戏里显示的文本...")}
                        />
                        <p className="text-[10px] text-slate-400">
                          {t("Supports newlines if the game rendering context supports multi-line text blocks.", "支持换行。当用于任务介绍、加载界面或雷达文本时，多行文本可正常在游戏中渲染。")}
                        </p>
                      </div>

                      {/* 3. Extra Yuri Value */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider font-mono">
                            {t("Extra String value (WRTS)", "附加关联字符串 (WRTS/Extra)")}
                          </label>
                          <span className="bg-amber-100 text-amber-800 text-[9px] font-mono font-bold px-1 rounded">
                            {t("Optional / YR", "选填 / 尤里的复仇")}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={activeLabel.extraValue || ""}
                          onChange={(e) => handleUpdateActiveLabel({ extraValue: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-md py-2 px-3 text-sm focus:bg-white focus:outline-none focus:border-amber-500 font-mono"
                          placeholder={t("e.g. Special trigger metadata", "例如特殊触发额外数据")}
                        />
                        <p className="text-[10px] text-slate-400">
                          {t("Yuri's Revenge features optional supplementary ASCII extra strings stored as WRTS blocks. Leave blank for standard RTS blocks.", "《尤里的复仇》扩展包格式特有的可选附加 ASCII 字段。如果不做特殊触发器读取，通常请留空。")}
                        </p>
                      </div>

                      {/* Active Label Index info footer */}
                      <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1.5 font-mono">
                          <Info className="h-3.5 w-3.5 text-slate-300" />
                          {t("Changes auto-saved instantly to workspace memory.", "更改已实时同步保存至浏览器本地内存。")}
                        </span>
                        
                        {modifiedIds.has(activeLabel.id) && (
                          <span className="flex items-center gap-1.5 text-amber-500 font-mono font-semibold">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                            {t("Modified", "已修改")}
                          </span>
                        )}
                      </div>

                    </div>

                    {/* Metadata Settings / Global options bar at bottom of detail pane */}
                    <div className="p-3 bg-slate-50 border-t border-slate-200 grid grid-cols-2 gap-3 text-xs">
                      
                      {/* Language Selection */}
                      <div className="space-y-1">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                          {t("File Language ID", "语言代码 (Language ID)")}
                        </label>
                        <select
                          value={csfFile.language}
                          onChange={(e) => handleLanguageChange(parseInt(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded-md py-1 px-2 focus:outline-none focus:border-amber-500"
                        >
                          {LANGUAGE_LIST.map((lang) => (
                            <option key={lang.id} value={lang.id}>
                              {lang.id} - {lang.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Version identifier */}
                      <div className="space-y-1">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                          {t("CSF Format Version", "CSF 格式主版本号")}
                        </label>
                        <input
                          type="number"
                          value={csfFile.version}
                          onChange={(e) => handleVersionChange(parseInt(e.target.value) || 3)}
                          className="w-full bg-white border border-slate-200 rounded-md py-1 px-2 focus:outline-none focus:border-amber-500 font-mono"
                        />
                      </div>

                    </div>

                  </motion.div>
                ) : (
                  <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col items-center justify-center text-center text-slate-400 min-h-[400px]">
                    <Globe className="h-12 w-12 text-slate-200 mb-2" />
                    <h3 className="text-base font-semibold text-slate-700">{t("No label selected", "未选择任何字条")}</h3>
                    <p className="text-xs text-slate-400 max-w-xs mt-1">
                      {t("Choose a translation key from the left navigator, search for specific terms, or add a fresh string key.", "请从左侧导航栏中选择一个翻译字条，或在搜索栏过滤、或新建一个全新字符串。")}
                    </p>
                  </div>
                )}
              </AnimatePresence>

              {/* Quick instructions and key bindings banner */}
              <div className="mt-3 bg-slate-900 border border-slate-800 p-3 rounded-xl text-slate-300 text-xs shadow-xs">
                <h4 className="font-semibold text-slate-100 mb-1 flex items-center gap-1.5 font-mono">
                  <span className="p-1 rounded bg-slate-850 border border-slate-800 text-[10px]">TIPS</span>
                  {t("Keyboard Shortcuts", "快捷键")}
                </h4>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-400 font-mono">
                  <li className="flex items-center gap-1.5">
                    <kbd className="bg-slate-800 text-slate-200 px-1 rounded border border-slate-700 text-[10px]">↑</kbd> 
                    <kbd className="bg-slate-800 text-slate-200 px-1 rounded border border-slate-700 text-[10px]">↓</kbd> 
                    <span>{t("Select previous/next label", "上下切换选中字条")}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <kbd className="bg-slate-800 text-slate-200 px-1 rounded border border-slate-700 text-[10px]">Tab</kbd>
                    <span>{t("Quickly cycle between input fields", "在各个输入框间循环焦点")}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <kbd className="bg-slate-800 text-slate-200 px-1.5 rounded border border-slate-700 text-[10px]">Ctrl + Z</kbd>
                    <span>{t("Undo modification", "撤销一步修改")}</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <kbd className="bg-slate-800 text-slate-200 px-1.5 rounded border border-slate-700 text-[10px]">Ctrl + Y</kbd>
                    <span>{t("Redo modification", "恢复一步修改")}</span>
                  </li>
                </ul>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* Humble, Clean Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-xs text-slate-400 mt-auto font-mono">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <span>
            {t("Red Alert 2 String Table Editor &copy; 2026. Fully client-side processing.By Lirt1218.", "《红色警戒2》CSF 语言包二进制编辑器 &copy; 2026。100% 浏览器客户端解析，无需上传服务器。By Lirt1218")}
          </span>
        </div>
      </footer>

    </div>
  );
}
