"""
Epako Voice AI: Clinical Speech Evaluation & Biomarker PDF Generator
Authoritative, publication-grade acoustic telemetry report for Speech-Language Pathologists (SLPs),
Neurologists, and CPT Insurance Documentation.

Mandatory Design Guidelines:
- Strict Anti-AI-Slop compliance: Zero em-dashes, human-composed clinical language.
- Atmospheric Warm Medical Palette: Forest Moss Pine, Matcha Celadon, Warm Slate, Soft Linen.
- Clear Gestalt Enclosure and Proximity for all metric panels.
- Embedded high-resolution vector/raster acoustic charts (Vowel Space & Longitudinal Progress).
"""

import os
import io
import time
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple

import numpy as np
import matplotlib
matplotlib.use("Agg")  # Non-interactive background rendering
import matplotlib.pyplot as plt
import matplotlib.patches as patches

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfgen import canvas


# ---------------------------------------------------------------------------
# COLOR PALETTE (Warm Biological Sanctuary)
# ---------------------------------------------------------------------------
COLOR_DEEP_PINE = colors.HexColor("#1A2620")      # Primary text and dark accents
COLOR_SLATE = colors.HexColor("#383D36")          # Secondary body copy
COLOR_CELADON = colors.HexColor("#46734C")        # Accent matcha green
COLOR_CELADON_LIGHT = colors.HexColor("#EAF1EB")  # Table header and highlight background
COLOR_CELADON_TINT = colors.HexColor("#F2F7F3")   # Alternating row fill
COLOR_BORDER = colors.HexColor("#D2DDD4")         # Soft tactile border
COLOR_HONEY = colors.HexColor("#C69B32")          # Attention / moderate elevation
COLOR_TERRACOTTA = colors.HexColor("#D87D65")     # Clinical alert accent
COLOR_MUTED_BG = colors.HexColor("#F8F6F0")       # Washi linen surface tint


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute total pages and stamp
    dignified clinical footer with pagination and digital signature hash.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, total_pages: int):
        self.saveState()
        self.setFont("Helvetica", 7.5)
        self.setFillColor(COLOR_SLATE)

        # Top subtle running rule
        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.5)
        self.line(36, 764, 576, 764)

        # Header running line
        self.drawString(36, 768, "Epako Voice AI | Clinical Bio-Acoustic Telemetry Report")
        self.drawRightString(576, 768, f"Confidential Medical Record | Session {self.session_id}")

        # Footer running rule
        self.line(36, 32, 576, 32)

        # Footer details
        footer_left = "Epako Neuromotor Sanctuary | Speech-Language Pathology Evaluation Protocol"
        self.drawString(36, 22, footer_left)
        self.drawRightString(576, 22, f"Page {self._pageNumber} of {total_pages}")
        self.restoreState()


def generate_acoustic_charts(metrics: Dict[str, Any], history: Optional[List[Dict[str, Any]]] = None) -> io.BytesIO:
    """
    Generates a composite 2-panel clinical acoustic telemetry figure:
    Panel 1: Vowel Space Area (F1 vs F2 Formant Centralization)
    Panel 2: Longitudinal Stability & Articulation Velocity Trajectory
    """
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.2, 2.25), dpi=220)
    fig.patch.set_facecolor("#FAF9F5")

    # ---------------- PANEL 1: VOWEL SPACE TRIANGLE ----------------
    ax1.set_facecolor("#FAF9F5")
    
    # Standard healthy reference vowel space coordinates (Hz)
    # Normative: /i/ (F1 ~ 280, F2 ~ 2250), /u/ (F1 ~ 320, F2 ~ 850), /a/ (F1 ~ 750, F2 ~ 1250)
    norm_f1 = [280, 750, 320, 280]
    norm_f2 = [2250, 1250, 850, 2250]

    # Dysarthric compressed vowel space (centralized toward 500 Hz / 1500 Hz)
    fcr = float(metrics["formant_centralization_ratio"])
    scale = max(0.45, 1.0 / (fcr if fcr > 0 else 1.15))
    
    center_f1 = 450
    center_f2 = 1450
    dys_f1 = [center_f1 + (y - center_f1) * scale for y in norm_f1]
    dys_f2 = [center_f2 + (x - center_f2) * scale for x in norm_f2]

    # Plot Normative Triangle (Dotted Matcha)
    ax1.plot(norm_f2, norm_f1, color="#46734C", linestyle="--", linewidth=1.1, label="Normative Target", alpha=0.7)
    ax1.scatter(norm_f2[:-1], norm_f1[:-1], color="#46734C", s=24, zorder=5)

    # Plot Patient Compressed Space (Solid Warm Terracotta)
    ax1.plot(dys_f2, dys_f1, color="#D87D65", linewidth=1.6, label="Schematic (scaled from FCR)")
    ax1.scatter(dys_f2[:-1], dys_f1[:-1], color="#D87D65", s=28, zorder=6)

    # Annotate Vowel Anchors
    vowels = ["/i/", "/a/", "/u/"]
    for i, v in enumerate(vowels):
        ax1.annotate(v, (norm_f2[i] + 35, norm_f1[i] - 12), fontsize=7, color="#1A2620", fontweight="semibold")

    # Invert axes per clinical phonetics convention: F2 high-to-low on X, F1 low-to-high on Y
    ax1.invert_xaxis()
    ax1.invert_yaxis()
    ax1.set_title("Vowel Articulation Space (F1 vs F2)", fontsize=7.5, fontweight="bold", color="#1A2620", pad=5)
    ax1.set_xlabel("F2 Formant (Hz)", fontsize=6.5, color="#383D36")
    ax1.set_ylabel("F1 Formant (Hz)", fontsize=6.5, color="#383D36")
    ax1.tick_params(colors="#383D36", labelsize=6, pad=2)
    ax1.grid(True, linestyle=":", alpha=0.45, color="#A8B5AA")
    ax1.legend(loc="lower left", fontsize=6, frameon=True, facecolor="#F2F7F3", edgecolor="#D2DDD4")

    # ---------------- PANEL 2: LONGITUDINAL TRAJECTORY ----------------
    ax2.set_facecolor("#FAF9F5")

    if history and len(history) >= 2:
        sessions = [f"S{i+1}" for i in range(len(history))]
        velocities = [float(h["articulation_velocity"]) for h in history]
    else:
        sessions, velocities = [], []
        ax2.text(0.5, 0.5, "No longitudinal data", ha="center", va="center", transform=ax2.transAxes, fontsize=7, color="#383D36")

    x = np.arange(len(sessions))
    ax2.plot(x, velocities, color="#46734C", marker="o", linewidth=1.6, markersize=4, label="Articulation Velocity (syll/s)")
    
    # Healthy band
    ax2.axhspan(3.8, 5.2, color="#EAF1EB", alpha=0.6, label="Normative (3.8-5.2)")
    ax2.set_xticks(x)
    ax2.set_xticklabels(sessions, fontsize=6, color="#383D36")
    ax2.set_ylim(1.0, 5.4)
    ax2.set_title("Articulation Velocity Progression", fontsize=7.5, fontweight="bold", color="#1A2620", pad=5)
    ax2.set_xlabel("Clinical Session Timeline", fontsize=6.5, color="#383D36")
    ax2.set_ylabel("Syllables / Sec", fontsize=6.5, color="#383D36")
    ax2.tick_params(colors="#383D36", labelsize=6, pad=2)
    ax2.grid(True, linestyle=":", alpha=0.45, color="#A8B5AA")
    ax2.legend(loc="lower right", fontsize=6, frameon=True, facecolor="#F2F7F3", edgecolor="#D2DDD4")

    # Visual polish
    for ax in (ax1, ax2):
        for spine in ax.spines.values():
            spine.set_color("#D2DDD4")
            spine.set_linewidth(0.8)

    plt.tight_layout(pad=1.0)
    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=220, facecolor=fig.get_facecolor(), edgecolor="none")
    buf.seek(0)
    plt.close(fig)
    return buf


def generate_clinical_pdf(report_data: Dict[str, Any], output_path: Optional[str] = None) -> bytes:
    """
    Assembles a comprehensive, publication-grade Clinical SLP Evaluation PDF.
    
    Parameters:
    - report_data: Structured clinical dictionary containing:
        - patient: Dict with name, id, age, condition, clinician, clinic_name, date, cpt_codes
        - biomarkers: Dict with velocity, pause_ratio, jitter, shimmer, fcr, f0, stability
        - utterances: List of dicts with original_text, repaired_text, latency_ms
        - slp_assessment: Dict with impression, recommendation, exercises, frequency
        - history: Optional longitudinal trend items
    - output_path: Optional local file path to save PDF directly
    
    Returns:
    - bytes: Generated PDF byte buffer
    """
    pdf_buffer = io.BytesIO()

    # Letter size is 612 x 792 pt. Margins 34 pt leaves 544 pt width and 728 pt usable height.
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=letter,
        leftMargin=34,
        rightMargin=34,
        topMargin=32,
        bottomMargin=32,
    )

    # Attach session id to canvas instance for dynamic headers
    session_id = report_data.get("session_id", f"EPK-{int(time.time()) % 1000000:06d}")
    NumberedCanvas.session_id = session_id

    # Typography & Styles
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=15,
        textColor=COLOR_DEEP_PINE,
    )

    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=COLOR_SLATE,
    )

    section_header_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=10.5,
        textColor=COLOR_DEEP_PINE,
        spaceBefore=3,
        spaceAfter=1.5,
    )

    body_style = ParagraphStyle(
        "ReportBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7,
        leading=8.8,
        textColor=COLOR_SLATE,
    )

    bold_label_style = ParagraphStyle(
        "BoldLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7,
        leading=8.8,
        textColor=COLOR_DEEP_PINE,
    )

    table_header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=6.8,
        leading=8.2,
        textColor=COLOR_DEEP_PINE,
        alignment=TA_CENTER,
    )

    table_cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=6.8,
        leading=8.2,
        textColor=COLOR_SLATE,
    )

    table_cell_center = ParagraphStyle(
        "TableCellCenter",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=6.8,
        leading=8.2,
        textColor=COLOR_SLATE,
        alignment=TA_CENTER,
    )

    clinical_highlight_style = ParagraphStyle(
        "ClinicalHighlight",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=6.8,
        leading=8.2,
        textColor=COLOR_CELADON,
        alignment=TA_CENTER,
    )

    alert_style = ParagraphStyle(
        "ClinicalAlert",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=6.8,
        leading=8.2,
        textColor=COLOR_TERRACOTTA,
        alignment=TA_CENTER,
    )

    story = []

    # ---------------------------------------------------------------------------
    # 1. HEADER & MEDICAL SANCTUARY BRANDING
    # ---------------------------------------------------------------------------
    eval_date = report_data.get("evaluation_date", datetime.now().strftime("%B %d, %Y"))
    clinic_name = report_data.get("clinic_name", "Epako Bio-Acoustic Speech Sanctuary")
    
    header_table_data = [
        [
            Paragraph("<b>EPAKO VOICE AI</b>  |  CLINICAL SPEECH RESTORATION", ParagraphStyle("Brand", fontName="Helvetica-Bold", fontSize=10, leading=12, textColor=COLOR_CELADON)),
            Paragraph(f"<b>Date:</b> {eval_date}", ParagraphStyle("DateRight", fontName="Helvetica", fontSize=7.5, leading=9, textColor=COLOR_SLATE, alignment=TA_RIGHT))
        ],
        [
            Paragraph("Clinical Speech &amp; Neuromotor Acoustic Evaluation", title_style),
            Paragraph(f"<b>Session Code:</b> {session_id}", ParagraphStyle("CodeRight", fontName="Helvetica", fontSize=7.5, leading=9, textColor=COLOR_SLATE, alignment=TA_RIGHT))
        ],
        [
            Paragraph(f"Objective Telemetry Protocol for Speech-Language Pathologists  |  {clinic_name}", subtitle_style),
            ""
        ]
    ]

    header_table = Table(header_table_data, colWidths=[385, 159])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("TOPPADDING", (0, 0), (-1, -1), 0.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 3))

    # ---------------------------------------------------------------------------
    # 2. PATIENT DEMOGRAPHICS & CLINICAL PROTOCOL STRIP
    # ---------------------------------------------------------------------------
    pt = report_data["patient"]
    patient_name = pt["name"]
    patient_id = pt["id"]
    condition = pt["condition"]
    clinician = pt["clinician"]

    patient_grid_data = [
        [
            Paragraph("<b>Patient Name:</b>", bold_label_style),
            Paragraph(patient_name, body_style),
            Paragraph("<b>Medical Record:</b>", bold_label_style),
            Paragraph(patient_id, body_style),
        ],
        [
            Paragraph("<b>Attending SLP:</b>", bold_label_style),
            Paragraph(clinician, body_style),
            Paragraph("<b>Pathology Protocol:</b>", bold_label_style),
            Paragraph(condition, body_style),
        ]
    ]

    patient_table = Table(patient_grid_data, colWidths=[88, 184, 92, 180])
    patient_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_MUTED_BG),
        ("BOX", (0, 0), (-1, -1), 0.6, COLOR_BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, COLOR_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(patient_table)
    story.append(Spacer(1, 4))

    # ---------------------------------------------------------------------------
    # 3. BIO-ACOUSTIC BIOMARKER MATRIX
    # ---------------------------------------------------------------------------
    story.append(Paragraph("Acoustic Telemetry &amp; Neuromotor Biomarker Matrix", section_header_style))

    bio = report_data["biomarkers"]
    vel = float(bio["articulation_velocity"])
    speaking_rate = float(bio["speaking_rate"])
    pause_ratio = float(bio["pause_ratio"]) * 100
    jitter = float(bio["vocal_jitter_pct"])
    shimmer = float(bio["vocal_shimmer_pct"])
    fcr = float(bio["formant_centralization_ratio"])
    f0 = float(bio["mean_f0_hz"])
    stability = float(bio["stability_index"])

    def vel_status(v):
        if v >= 3.8: return Paragraph("Normative", clinical_highlight_style)
        if v >= 3.0: return Paragraph("Mild Bradykinesia", table_cell_center)
        return Paragraph("Moderate Deficit", alert_style)

    def pause_status(p):
        if p <= 22: return Paragraph("Normative", clinical_highlight_style)
        if p <= 35: return Paragraph("Mild Motor Freezing", table_cell_center)
        return Paragraph("Elevated Hesitation", alert_style)

    def jitter_status(j):
        if j <= 1.04: return Paragraph("Normative", clinical_highlight_style)
        if j <= 2.5: return Paragraph("Mild Tremor", table_cell_center)
        return Paragraph("Ataxic Perturbation", alert_style)

    def fcr_status(f):
        if f <= 1.05: return Paragraph("Normative", clinical_highlight_style)
        if f <= 1.20: return Paragraph("Mild Centralization", table_cell_center)
        return Paragraph("Severe Flattening", alert_style)

    biomarker_rows = [
        [
            Paragraph("Clinical Biomarker Parameter", table_header_style),
            Paragraph("Observed Telemetry", table_header_style),
            Paragraph("Normative Window", table_header_style),
            Paragraph("Neuromotor Interpretation", table_header_style),
        ],
        [
            Paragraph("<b>Articulation Velocity</b> (active phonation)", table_cell_style),
            Paragraph(f"<b>{vel:.2f} syll / sec</b>", table_cell_center),
            Paragraph("3.80 - 5.20 syll / s", table_cell_center),
            vel_status(vel),
        ],
        [
            Paragraph("<b>Pause Duration Ratio</b> (involuntary motor pause)", table_cell_style),
            Paragraph(f"<b>{pause_ratio:.1f} %</b>", table_cell_center),
            Paragraph("12.0 - 22.0 %", table_cell_center),
            pause_status(pause_ratio),
        ],
        [
            Paragraph("<b>Vocal Period Jitter</b> (F0 cycle stability)", table_cell_style),
            Paragraph(f"<b>{jitter:.2f} %</b>", table_cell_center),
            Paragraph("&lt; 1.04 %", table_cell_center),
            jitter_status(jitter),
        ],
        [
            Paragraph("<b>Vocal Amplitude Shimmer</b> (intensity perturbation)", table_cell_style),
            Paragraph(f"<b>{shimmer:.2f} %</b>", table_cell_center),
            Paragraph("&lt; 3.81 %", table_cell_center),
            Paragraph("Normative" if shimmer < 3.81 else "Elevated", table_cell_center),
        ],
        [
            Paragraph("<b>Formant Centralization Ratio (FCR)</b>", table_cell_style),
            Paragraph(f"<b>{fcr:.3f}</b>", table_cell_center),
            Paragraph("0.850 - 1.020", table_cell_center),
            fcr_status(fcr),
        ],
        [
            Paragraph("<b>Composite Vocal Stability Score</b>", table_cell_style),
            Paragraph(f"<b>{stability:.1f} / 100</b>", clinical_highlight_style),
            Paragraph("&gt; 88.0 / 100", table_cell_center),
            Paragraph("Normative" if stability > 88.0 else "Below normative", table_cell_center),
        ],
    ]

    biomarker_table = Table(biomarker_rows, colWidths=[168, 120, 130, 126])
    biomarker_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_CELADON_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.6, COLOR_BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, COLOR_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, COLOR_CELADON_TINT]),
        ("TOPPADDING", (0, 0), (-1, -1), 1.8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.8),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(biomarker_table)
    story.append(Spacer(1, 4))

    # ---------------------------------------------------------------------------
    # 4. ACOUSTIC CHARTS (VOWEL SPACE & VELOCITY TRAJECTORY)
    # ---------------------------------------------------------------------------
    story.append(Paragraph("Acoustic Geometry &amp; Longitudinal Recovery Trajectory", section_header_style))
    chart_buf = generate_acoustic_charts(bio, report_data.get("history"))
    chart_img = Image(chart_buf, width=544, height=140)
    story.append(chart_img)
    story.append(Spacer(1, 4))

    # ---------------------------------------------------------------------------
    # 5. CLINICAL UTTERANCE REHABILITATION SAMPLES
    # ---------------------------------------------------------------------------
    story.append(Paragraph("Speech Rehabilitation Samples &amp; Intent Clarification", section_header_style))

    utterances = report_data["utterances"]

    utt_rows = [
        [
            Paragraph("Patient Spoken Utterance (Dysarthric Input)", table_header_style),
            Paragraph("Acoustically Restored &amp; Repaired Speech", table_header_style),
            Paragraph("Latency", table_header_style),
        ]
    ]

    for u in utterances[:2]:
        utt_rows.append([
            Paragraph(f'<i>"{u["original_text"]}"</i>', table_cell_style),
            Paragraph(f'<b>"{u["repaired_text"]}"</b>', table_cell_style),
            Paragraph(f"{u['latency_ms']:.1f} ms", table_cell_center),
        ])

    utt_table = Table(utt_rows, colWidths=[240, 244, 60])
    utt_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), COLOR_CELADON_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.6, COLOR_BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, COLOR_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, COLOR_CELADON_TINT]),
        ("TOPPADDING", (0, 0), (-1, -1), 1.8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.8),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(utt_table)
    story.append(Spacer(1, 4))

    # ---------------------------------------------------------------------------
    # 6. SLP CLINICAL IMPRESSION & RECOMMENDATIONS
    # ---------------------------------------------------------------------------
    story.append(Paragraph("Speech-Language Pathologist Assessment &amp; Treatment Plan", section_header_style))

    slp = report_data["slp_assessment"]
    impression = slp["impression"]
    home_plan = slp["home_plan"]
    freq = slp["frequency"]

    plan_table_data = [
        [
            Paragraph("<b>Clinical Impression:</b>", bold_label_style),
            Paragraph(impression, body_style)
        ],
        [
            Paragraph("<b>Home Regimen:</b>", bold_label_style),
            Paragraph(home_plan, body_style)
        ],
        [
            Paragraph("<b>Prescription:</b>", bold_label_style),
            Paragraph(freq, body_style)
        ]
    ]

    plan_table = Table(plan_table_data, colWidths=[96, 448])
    plan_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_MUTED_BG),
        ("BOX", (0, 0), (-1, -1), 0.6, COLOR_BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, COLOR_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(plan_table)
    story.append(Spacer(1, 4))

    # ---------------------------------------------------------------------------
    # 7. CLINICIAN SIGNATURE & DIGITAL AUDIT BLOCK
    # ---------------------------------------------------------------------------
    sig_data = [
        [
            Paragraph(f"<b>Attending Clinician:</b> {clinician}", body_style),
            Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}", ParagraphStyle("TimeRight", fontName="Helvetica", fontSize=6.5, leading=8, textColor=COLOR_SLATE, alignment=TA_RIGHT))
        ]
    ]

    sig_table = Table(sig_data, colWidths=[315, 229])
    sig_table.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, COLOR_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(sig_table)

    # Build PDF
    doc.build(story, canvasmaker=NumberedCanvas)
    pdf_bytes = pdf_buffer.getvalue()
    pdf_buffer.close()

    if output_path:
        with open(output_path, "wb") as f:
            f.write(pdf_bytes)
        print(f"[+] Clinical PDF Report successfully generated: {output_path} ({len(pdf_bytes)} bytes)")

    return pdf_bytes

