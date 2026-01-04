"use client";

import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useZen } from "@/contexts/ZenContext";
import { setZenStatus } from "./ZenStatusBar";

interface Command {
  name: string;
  aliases?: string[];
  description: string;
  execute: (args: string[]) => void;
}

export function ZenCommandBar() {
  const [input, setInput] = useState("");
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { theme, commandHistory, addToHistory, disableZenMode } = useZen();

  // Define available commands - memoized to prevent infinite loops
  const commands: Command[] = useMemo(() => [
    {
      name: "go",
      aliases: ["nav", "navigate"],
      description: "Navigate to a page (go dashboard, go students)",
      execute: (args) => {
        const page = args[0]?.toLowerCase();
        const routes: Record<string, string> = {
          dashboard: "/zen",
          home: "/zen",
          students: "/zen/students",
          sessions: "/zen/sessions",
          courseware: "/zen/courseware",
          revenue: "/zen/revenue",
          settings: "/zen/settings",
        };
        if (routes[page]) {
          router.push(routes[page]);
          setZenStatus(`Navigating to ${page}`, "info");
        } else {
          setZenStatus(`Unknown page: ${page}. Try: dashboard, students, sessions, courseware, revenue`, "error");
        }
      },
    },
    {
      name: "dashboard",
      description: "Go to dashboard",
      execute: () => {
        router.push("/zen");
        setZenStatus("Navigating to dashboard", "info");
      },
    },
    {
      name: "students",
      description: "Go to students",
      execute: () => {
        router.push("/zen/students");
        setZenStatus("Navigating to students", "info");
      },
    },
    {
      name: "sessions",
      description: "Go to sessions",
      execute: () => {
        router.push("/zen/sessions");
        setZenStatus("Navigating to sessions", "info");
      },
    },
    {
      name: "courseware",
      description: "Go to courseware",
      execute: () => {
        router.push("/zen/courseware");
        setZenStatus("Navigating to courseware", "info");
      },
    },
    {
      name: "revenue",
      description: "Go to revenue",
      execute: () => {
        router.push("/zen/revenue");
        setZenStatus("Navigating to revenue", "info");
      },
    },
    {
      name: "exit",
      aliases: ["gui", "quit"],
      description: "Exit Zen mode and return to GUI",
      execute: () => {
        disableZenMode();
        router.push("/");
        setZenStatus("Exiting Zen mode...", "info");
      },
    },
    {
      name: "help",
      aliases: ["?", "h"],
      description: "Show available commands",
      execute: (args) => {
        if (args[0]) {
          const cmd = commands.find(
            (c) => c.name === args[0] || c.aliases?.includes(args[0])
          );
          if (cmd) {
            setZenStatus(`${cmd.name}: ${cmd.description}`, "info");
          } else {
            setZenStatus(`Unknown command: ${args[0]}`, "error");
          }
        } else {
          setZenStatus(
            `Commands: ${commands.map((c) => c.name).join(", ")}. Type 'help <command>' for details.`,
            "info"
          );
        }
      },
    },
    {
      name: "clear",
      description: "Clear the command bar",
      execute: () => {
        setInput("");
        setZenStatus("Cleared", "info");
      },
    },
    {
      name: "theme",
      description: "Show current theme or switch themes",
      execute: (args) => {
        if (args[0]) {
          setZenStatus(`Theme switching coming soon. Current: ${theme.name}`, "info");
        } else {
          setZenStatus(`Current theme: ${theme.name}`, "info");
        }
      },
    },
  ], [router, disableZenMode, theme.name]);

  // Get all command names and aliases for autocomplete - memoized
  const allCommandNames = useMemo(
    () => commands.flatMap((c) => [c.name, ...(c.aliases || [])]),
    [commands]
  );

  // Update suggestions based on input
  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }

    const inputLower = input.toLowerCase();
    const matches = [
      // Command matches
      ...allCommandNames.filter((name) => name.startsWith(inputLower)),
      // History matches
      ...commandHistory.filter(
        (cmd) => cmd.toLowerCase().startsWith(inputLower) && cmd !== input
      ),
    ].slice(0, 5);

    setSuggestions([...new Set(matches)]);
    setSelectedSuggestion(-1);
  }, [input, commandHistory, allCommandNames]);

  const executeCommand = useCallback(
    (commandString: string) => {
      const trimmed = commandString.trim();
      if (!trimmed) return;

      addToHistory(trimmed);

      const parts = trimmed.split(/\s+/);
      const cmdName = parts[0].toLowerCase();
      const args = parts.slice(1);

      const command = commands.find(
        (c) => c.name === cmdName || c.aliases?.includes(cmdName)
      );

      if (command) {
        command.execute(args);
      } else {
        // Try to find a close match
        const similar = allCommandNames.find(
          (name) =>
            name.startsWith(cmdName.slice(0, 2)) ||
            cmdName.startsWith(name.slice(0, 2))
        );
        if (similar) {
          setZenStatus(`Unknown command '${cmdName}'. Did you mean '${similar}'?`, "error");
        } else {
          setZenStatus(`Unknown command: ${cmdName}. Type 'help' for available commands.`, "error");
        }
      }

      setInput("");
      setHistoryIndex(-1);
    },
    [addToHistory, commands, allCommandNames]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        if (selectedSuggestion >= 0 && suggestions[selectedSuggestion]) {
          setInput(suggestions[selectedSuggestion]);
          setSuggestions([]);
          setSelectedSuggestion(-1);
        } else {
          executeCommand(input);
        }
        break;

      case "Tab":
        e.preventDefault();
        if (suggestions.length > 0) {
          const nextIndex =
            selectedSuggestion < 0 ? 0 : (selectedSuggestion + 1) % suggestions.length;
          setSelectedSuggestion(nextIndex);
          setInput(suggestions[nextIndex]);
        }
        break;

      case "ArrowUp":
        e.preventDefault();
        if (suggestions.length > 0 && selectedSuggestion > 0) {
          setSelectedSuggestion(selectedSuggestion - 1);
          setInput(suggestions[selectedSuggestion - 1]);
        } else if (commandHistory.length > 0) {
          const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
          setSuggestions([]);
        }
        break;

      case "ArrowDown":
        e.preventDefault();
        if (suggestions.length > 0 && selectedSuggestion < suggestions.length - 1) {
          setSelectedSuggestion(selectedSuggestion + 1);
          setInput(suggestions[selectedSuggestion + 1]);
        } else if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setInput("");
        }
        break;

      case "Escape":
        e.preventDefault();
        setInput("");
        setSuggestions([]);
        setHistoryIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Global keyboard shortcut to focus command bar
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      // Focus on "/" key (but not when already focused on input)
      if (
        e.key === "/" &&
        document.activeElement !== inputRef.current &&
        !["INPUT", "TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  return (
    <div
      className="zen-command-bar"
      style={{
        position: "relative",
        padding: "8px 16px",
        borderTop: "1px solid var(--zen-border)",
        backgroundColor: "var(--zen-bg)",
      }}
    >
      {/* Suggestions dropdown */}
      {suggestions.length > 0 && isFocused && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: "16px",
            right: "16px",
            backgroundColor: "var(--zen-bg)",
            border: "1px solid var(--zen-border)",
            borderBottom: "none",
            maxHeight: "150px",
            overflow: "auto",
          }}
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              style={{
                padding: "4px 8px",
                cursor: "pointer",
                backgroundColor:
                  index === selectedSuggestion
                    ? "var(--zen-accent)"
                    : "transparent",
                color:
                  index === selectedSuggestion
                    ? "var(--zen-bg)"
                    : "var(--zen-fg)",
              }}
              onClick={() => {
                setInput(suggestion);
                setSuggestions([]);
                inputRef.current?.focus();
              }}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}

      {/* Input line */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            color: "var(--zen-accent)",
            textShadow: "var(--zen-glow)",
          }}
        >
          {theme.prompt}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          placeholder="Type a command or press / to focus"
          style={{
            flex: 1,
            backgroundColor: "transparent",
            border: "none",
            outline: "none",
            color: "var(--zen-fg)",
            fontFamily: "inherit",
            fontSize: "inherit",
            caretColor: "var(--zen-cursor)",
          }}
          autoComplete="off"
          spellCheck={false}
        />
        <span style={{ color: "var(--zen-dim)", fontSize: "11px" }}>
          Press / to focus • ↑↓ history • Tab autocomplete
        </span>
      </div>
    </div>
  );
}
