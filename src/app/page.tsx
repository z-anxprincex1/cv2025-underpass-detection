"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";

interface Detection {
  class_id: number;
  label: string;
  confidence: number;
  corners: number[][]; // [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
}

interface BackendStatus {
  status: string;
  model: string;
  classes: Record<number, string>;
  device: string;
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [annotatedUrl, setAnnotatedUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"annotated" | "original">("annotated");
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  
  // Model Settings
  const [confThreshold, setConfThreshold] = useState<number>(0.25);
  const [iouThreshold, setIouThreshold] = useState<number>(0.50);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize theme from system preference or local storage
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  // Sync theme with body class
  useEffect(() => {
    if (theme === "dark") {
      document.body.classList.add("dark");
      document.body.classList.remove("light");
    } else {
      document.body.classList.add("light");
      document.body.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setFile(file);
    }
  };

  const setFile = (file: File) => {
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setAnnotatedUrl(null);
    setDetections([]);
    setInferenceTime(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("conf", confThreshold.toString());
    formData.append("iou", iouThreshold.toString());

    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        alert(errData.detail || "Error running detection model.");
        return;
      }

      const data = await res.json();
      setAnnotatedUrl(data.annotated_image);
      setDetections(data.detections);
      setViewMode("annotated");
      
      // Inference speed parsing
      if (data.inference_speed_ms) {
        const speed = data.inference_speed_ms;
        const total = (speed.preprocess || 0) + (speed.inference || 0) + (speed.postprocess || 0);
        setInferenceTime(parseFloat(total.toFixed(1)));
      }
    } catch (e) {
      console.error(e);
      alert("Failed to connect to detection backend.");
    } finally {
      setLoading(false);
    }
  };

  const selectSample = async (samplePath: string, filename: string) => {
    setLoading(true);
    try {
      const res = await fetch(samplePath);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: "image/jpeg" });
      setFile(file);
    } catch (e) {
      console.error(e);
      alert("Failed to load sample image.");
    } finally {
      setLoading(false);
    }
  };

  const resetWorkspace = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnnotatedUrl(null);
    setDetections([]);
    setInferenceTime(null);
  };

  // Warning metrics computation
  const warningsCount = detections.filter(
    (d) => d.label === "Bridgeheightsign" || d.label === "HeightLimitBarrier"
  ).length;

  const getRiskStatus = () => {
    if (detections.length === 0) return "N/A";
    const hasBarrier = detections.some((d) => d.label === "HeightLimitBarrier");
    const hasBridge = detections.some((d) => d.label === "Bridge");
    
    if (hasBarrier && hasBridge) return "HIGH RISK";
    if (hasBridge || hasBarrier) return "EVALUATING";
    return "CLEAR";
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="brand-section" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: "0.8" }}>
            <span style={{ fontSize: "2.4rem", fontWeight: "900", letterSpacing: "0.02em", textTransform: "uppercase" }}>upass</span>
            <span style={{ fontSize: "1.75rem", fontWeight: "600", letterSpacing: "0.19em", textTransform: "uppercase", display: "block" }}>detect</span>
          </div>
          <span className="brand-badge">YOLOv8-OBB</span>
        </div>
        <div className="header-actions" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            onClick={toggleTheme}
            style={{
              background: "none",
              color: "var(--fg-color)",
              border: "1px solid var(--border-color)",
              padding: "4px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              cursor: "pointer",
              textTransform: "uppercase",
              fontWeight: "bold",
            }}
          >
            {theme === "light" ? "DARK MODE ☼" : "LIGHT MODE ☾"}
          </button>
        </div>
      </header>

      {/* Stats Summary Bar */}
      <section className="stats-grid">
        <div className="stat-item">
          <span className="stat-value">{detections.length}</span>
          <span className="stat-label">Objects Found</span>
        </div>
        <div className="stat-item">
          <span className="stat-value" style={{ color: getRiskStatus() === "HIGH RISK" ? "#ef4444" : "inherit" }}>
            {getRiskStatus()}
          </span>
          <span className="stat-label">Structure Warning</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">
            {inferenceTime !== null ? `${inferenceTime} ms` : "--"}
          </span>
          <span className="stat-label">Inference Speed</span>
        </div>
      </section>

      {/* Main Grid */}
      <main className="main-dashboard">
        {/* Workspace Panel */}
        <section className="workspace-panel">
          {!previewUrl ? (
            /* Upload Box */
            <div className="upload-container" onClick={triggerFileInput} onDragOver={handleDragOver} onDrop={handleDrop}>
              <div className="upload-icon">✦</div>
              <div className="upload-text-main">Drag & Drop Image or Click to Browse</div>
              <div className="upload-text-sub">Supports PNG, JPG, JPEG, WEBP</div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden-file-input"
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>
          ) : (
            /* Viewport View */
            <div className="viewport-card">
              <div className="viewport-header">
                <span>
                  FILE: {selectedFile?.name || "Loaded"} ({viewMode.toUpperCase()} VIEW)
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  {annotatedUrl && (
                    <>
                      <button
                        onClick={() => setViewMode("annotated")}
                        style={{
                          background: viewMode === "annotated" ? "var(--fg-color)" : "none",
                          color: viewMode === "annotated" ? "var(--bg-color)" : "var(--fg-color)",
                          border: "1px solid var(--border-color)",
                          padding: "2px 8px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                      >
                        ANNOTATED
                      </button>
                      <button
                        onClick={() => setViewMode("original")}
                        style={{
                          background: viewMode === "original" ? "var(--fg-color)" : "none",
                          color: viewMode === "original" ? "var(--bg-color)" : "var(--fg-color)",
                          border: "1px solid var(--border-color)",
                          padding: "2px 8px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                      >
                        ORIGINAL
                      </button>
                    </>
                  )}
                  <button
                    onClick={resetWorkspace}
                    style={{
                      background: "none",
                      color: "var(--fg-color)",
                      border: "1px solid var(--border-color)",
                      padding: "2px 8px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    RESET
                  </button>
                </div>
              </div>
              <div className="viewport-content">
                {loading ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
                    <div className="spinner"></div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem" }}>RUNNING YOLOv8-OBB INFERENCE...</span>
                  </div>
                ) : (
                  <img
                    src={viewMode === "annotated" && annotatedUrl ? annotatedUrl : previewUrl}
                    alt="Active Workspace Visual"
                    className="preview-image"
                  />
                )}
              </div>
            </div>
          )}

          {/* Sample Select List */}
          <div style={{ marginTop: "8px" }}>
            <h3 className="section-title">Select Sample Test Images</h3>
            <div className="samples-grid">
              <div className="sample-card" onClick={() => selectSample("/underpass_test_image.png", "underpass_test_image.png")}>
                <div style={{ position: "relative", height: "100px", width: "100%", marginBottom: "4px" }}>
                  <img src="/underpass_test_image.png" alt="Underpass sample thumbnail" style={{ width: "100%", height: "100%", objectFit: "cover", border: "1px solid var(--gray-mid)" }} />
                </div>
                <span className="sample-thumb-label">Concrete Underpass</span>
              </div>
              <div className="sample-card" onClick={() => selectSample("/tunnel_test_image.png", "tunnel_test_image.png")}>
                <div style={{ position: "relative", height: "100px", width: "100%", marginBottom: "4px" }}>
                  <img src="/tunnel_test_image.png" alt="Tunnel sample thumbnail" style={{ width: "100%", height: "100%", objectFit: "cover", border: "1px solid var(--gray-mid)" }} />
                </div>
                <span className="sample-thumb-label">Tunnel Entrance</span>
              </div>
            </div>
          </div>
        </section>

        {/* Sidebar Controls & Logs */}
        <section className="sidebar-panel">
          <div>
            <h3 className="section-title">Model Configuration</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
              <div className="control-group">
                <label className="control-label">
                  <span>Confidence Threshold</span>
                  <span className="control-value">{(confThreshold * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min="0.05"
                  max="0.95"
                  step="0.05"
                  value={confThreshold}
                  onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
                  className="slider-input"
                />
              </div>

              <div className="control-group">
                <label className="control-label">
                  <span>Intersection Over Union</span>
                  <span className="control-value">{(iouThreshold * 100).toFixed(0)}%</span>
                </label>
                <input
                  type="range"
                  min="0.10"
                  max="0.90"
                  step="0.05"
                  value={iouThreshold}
                  onChange={(e) => setIouThreshold(parseFloat(e.target.value))}
                  className="slider-input"
                />
              </div>

              <button
                onClick={handleUpload}
                disabled={!selectedFile || loading}
                className="button-primary"
                style={{ marginTop: "8px" }}
              >
                {loading ? "Processing..." : "Run Detection"}
              </button>
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "300px" }}>
            <h3 className="section-title">Detections Log</h3>
            <div className="data-table-container" style={{ flex: 1, marginTop: "8px" }}>
              {detections.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--gray-dark)" }}>
                  {annotatedUrl ? "No objects detected with current thresholds." : "Upload an image and run detection to populate logs."}
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>CLASS</th>
                      <th>CONFIDENCE</th>
                      <th>TYPE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detections.map((det, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: "bold" }}>{det.label}</td>
                        <td>{(det.confidence * 100).toFixed(1)}%</td>
                        <td>
                          {det.label === "Bridgeheightsign" || det.label === "HeightLimitBarrier" ? (
                            <span className="badge-clearance">LIMIT SIGN</span>
                          ) : det.label === "Tunnel" || det.label === "Bridge" ? (
                            <span className="badge-alert">STRUCTURE</span>
                          ) : (
                            <span>OBJECT</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer Removed */}
    </div>
  );
}
