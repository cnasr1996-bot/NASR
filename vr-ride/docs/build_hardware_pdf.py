"""Builds docs/NASR-VR-Ride-Hardware-25-Seats.pdf — hardware plan for a 25-seat VR motion hall.

    pip install reportlab
    python docs/build_hardware_pdf.py
"""
import os
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, CondPageBreak,
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Circle, Polygon, Group

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'NASR-VR-Ride-Hardware-25-Seats.pdf')

pdfmetrics.registerFont(TTFont('Sans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('Sans-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFontFamily('Sans', normal='Sans', bold='Sans-Bold', italic='Sans', boldItalic='Sans-Bold')

INK = colors.HexColor('#161a23')
MUTED = colors.HexColor('#5c6475')
LINE = colors.HexColor('#d9dde6')
SOFT = colors.HexColor('#f3f5f9')
ACCENT = colors.HexColor('#2f6fe4')
ACCENT_SOFT = colors.HexColor('#e7effd')
RED = colors.HexColor('#d1343b')
RED_SOFT = colors.HexColor('#fdecec')
GREEN = colors.HexColor('#1f8f55')
AMBER = colors.HexColor('#b66a00')
AMBER_SOFT = colors.HexColor('#fff4e0')
WATER = colors.HexColor('#1595c4')

S = {
    'h1': ParagraphStyle('h1', fontName='Sans-Bold', fontSize=17, leading=22, textColor=INK, spaceBefore=4, spaceAfter=8),
    'h2': ParagraphStyle('h2', fontName='Sans-Bold', fontSize=12, leading=16, textColor=INK, spaceBefore=10, spaceAfter=5),
    'body': ParagraphStyle('body', fontName='Sans', fontSize=9.2, leading=13.4, textColor=INK, spaceAfter=5),
    'small': ParagraphStyle('small', fontName='Sans', fontSize=7.8, leading=10.4, textColor=MUTED),
    'cell': ParagraphStyle('cell', fontName='Sans', fontSize=7.9, leading=10.2, textColor=INK),
    'cellb': ParagraphStyle('cellb', fontName='Sans-Bold', fontSize=7.9, leading=10.2, textColor=INK),
    'cellh': ParagraphStyle('cellh', fontName='Sans-Bold', fontSize=7.6, leading=10, textColor=colors.white),
    'bullet': ParagraphStyle('bullet', fontName='Sans', fontSize=9.2, leading=13.4, textColor=INK, leftIndent=12, bulletIndent=2, spaceAfter=2.5),
    'callout': ParagraphStyle('callout', fontName='Sans', fontSize=8.9, leading=12.8, textColor=INK),
}

SAR = 3.75  # USD → SAR (pegged)


def P(text, style='body'):
    return Paragraph(text, S[style])


def bullets(items):
    return [Paragraph(t, S['bullet'], bulletText='•') for t in items]


def callout(text, kind='info'):
    bg, bar = {'info': (ACCENT_SOFT, ACCENT), 'warn': (AMBER_SOFT, AMBER), 'danger': (RED_SOFT, RED)}[kind]
    t = Table([[P(text, 'callout')]], colWidths=[174 * mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('LINEBEFORE', (0, 0), (0, -1), 3, bar),
        ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    return KeepTogether([t, Spacer(1, 7)])


def money(v):
    return f'${v:,.0f}'


def grid(rows, widths, header=True, zebra=True, bold_last=False, align_right_from=None):
    data = []
    for i, r in enumerate(rows):
        style = 'cellh' if header and i == 0 else ('cellb' if bold_last and i == len(rows) - 1 else 'cell')
        data.append([c if not isinstance(c, str) else P(c, style) for c in r])
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1 if header else 0)
    st = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4.5), ('RIGHTPADDING', (0, 0), (-1, -1), 4.5),
        ('TOPPADDING', (0, 0), (-1, -1), 3.2), ('BOTTOMPADDING', (0, 0), (-1, -1), 3.6),
        ('LINEBELOW', (0, 0), (-1, -1), 0.4, LINE),
    ]
    if header:
        st.append(('BACKGROUND', (0, 0), (-1, 0), INK))
    if zebra:
        for i in range(1 if header else 0, len(rows)):
            if i % 2 == 0:
                st.append(('BACKGROUND', (0, i), (-1, i), SOFT))
    if bold_last:
        st.append(('BACKGROUND', (0, len(rows) - 1), (-1, len(rows) - 1), ACCENT_SOFT))
        st.append(('LINEABOVE', (0, len(rows) - 1), (-1, len(rows) - 1), 1, INK))
    t.setStyle(TableStyle(st))
    return t


# ---------------------------------------------------------------------------
# Bill of materials. Prices: USD, estimates (Oct 2026), before VAT/shipping/
# import duty and installation labour unless stated. opt=True lines are only
# needed in some setups: counted in the high estimate, not the low one.

BOM = [
    ('VR headsets & rider kit', [
        ('Meta Quest 3 (512 GB) headset', 'Pancake lenses, 2064×2208 px per eye, Wi‑Fi 6E, 3.5 mm audio jack. 25 in use + 5 spares.', 30, 600, 700, False),
        ('Battery comfort strap with hot‑swap battery', 'e.g. BoboVR M3 Pro class. Balances weight on the head and roughly doubles run time.', 30, 70, 110, False),
        ('Extra swappable battery packs', 'Charged packs are swapped between shows, so headsets never leave the hall to charge.', 30, 35, 55, False),
        ('Multi‑bay charging cabinet', 'Lockable, charges 30 headsets + battery packs overnight; USB‑C PD.', 1, 600, 1500, False),
        ('Wipeable facial interfaces (PU/silicone)', '2 per headset, so one set is always cleaned and dry.', 60, 15, 30, False),
        ('Disposable hygiene eye masks', 'One per rider. Starter stock of about 3 weeks.', 3000, 0.05, 0.12, False),
        ('UV‑C headset sanitising cabinet', 'Disinfects headsets + headphones between groups (60–90 s cycle).', 1, 800, 3000, False),
        ('On‑ear wired headphones, short cable', 'Wipeable leatherette cushions. Private audio avoids echo between 25 headsets.', 30, 20, 45, False),
        ('Spare face/ear cushions, lens cloths, cleaning wipes', 'Alcohol‑free lens wipes, microfibre cloths.', 1, 150, 300, False),
    ]),
    ('Network, servers & control', [
        ('Ride server PC', '8‑core CPU, 32 GB RAM, 2 TB NVMe, 10 GbE network card. Runs the NASR VR Ride software.', 1, 1500, 2500, False),
        ('Backup PC (cold standby)', 'Mini PC with the same software and content; swap in within minutes.', 1, 500, 900, False),
        ('Wi‑Fi 7 access points with 6 GHz', 'UniFi U7 Pro or equivalent, ceiling‑mounted, PoE. 3 in use + 1 spare.', 4, 190, 260, False),
        ('Gateway / router', 'Separate networks for headsets, chairs and staff.', 1, 200, 400, False),
        ('Managed 48‑port PoE+ switch, 10G uplink', 'Powers the access points; Ethernet to all 25 chairs and effect controllers.', 1, 900, 1500, False),
        ('10G DAC cable / SFP+ module', 'Server ↔ switch.', 1, 30, 60, False),
        ('12U rack, patch panel, PDU', 'Lockable, in a ventilated control room.', 1, 400, 800, False),
        ('UPS 2200 VA, line‑interactive', 'Keeps server, switch and access points up through power dips.', 1, 500, 1000, False),
        ('Operator tablet', 'Runs the dashboard: load / start / stop, live seat status.', 1, 350, 600, False),
        ('Operator monitor + keyboard', 'Fixed dashboard at the operator desk.', 1, 200, 350, False),
        ('Cat6 cabling, ~35 drops, installed', 'Floor/trunk to each chair, access points, effects cabinet.', 1, 1500, 3500, False),
        ('Serial‑to‑Ethernet converters', 'Only if your chair controllers are USB/serial only (e.g. USR‑TCP232 class, UDP mode).', 25, 25, 60, True),
    ]),
    ('Motion chairs: integration & power', [
        ('Chair power distribution board', '3‑phase board, a breaker per 2–3 chairs, 30 mA RCDs, installed by a licensed electrician.', 1, 3000, 8000, False),
        ('Floor anchoring kits', 'Bolts the chair base to the slab so it can’t walk.', 25, 20, 50, False),
        ('Seat belts / lap bars', 'Only if your chairs don’t already have them.', 25, 30, 80, True),
    ]),
    ('Wind effects (fans)', [
        ('Compact high‑velocity fans, 150–200 mm', 'One per seat, aimed at face/chest from 60–80 cm. 25 + 3 spares.', 28, 30, 70, False),
        ('Floor post per seat (fan + mist nozzle)', 'Steel post with bracket, bolted to the floor in front of each chair.', 25, 40, 100, False),
        ('Shelly Pro 4PM (4‑channel relay, DIN)', 'Switches the 5 fan rows; 3 spare channels.', 2, 107, 130, False),
        ('Fan wiring and cable ducts', 'One circuit per row.', 1, 300, 700, False),
    ]),
    ('Water effects (mist)', [
        ('Misting pump, 24 V diaphragm, 100–150 psi', 'Fine mist, not a soak. 1 + 1 spare.', 2, 80, 250, False),
        ('50 L food‑grade tank with float valve', 'Or direct mains feed with pressure regulator + backflow preventer.', 1, 80, 200, False),
        ('Filter set: 5 µm sediment + carbon, gauge, regulator', 'Clean water = no clogged nozzles.', 1, 80, 200, False),
        ('Accumulator / small pressure tank', 'Instant mist on demand, fewer pump starts.', 1, 50, 120, False),
        ('Normally‑closed solenoid valves, 24 V DC', '1 master + 5 rows + 1 spare. Close automatically on power loss.', 7, 25, 60, False),
        ('Misting nozzles with anti‑drip check valve', '0.2–0.3 mm. One per seat + spares.', 30, 3, 8, False),
        ('PE tubing 3/8" + 1/4", push‑fit fittings', 'Main line along each row, short drop to each post.', 1, 200, 500, False),
        ('Shelly Pro 3 (dry‑contact relays, DIN)', 'Switches 24 V to the valves; auto‑off timer as a hardware backstop.', 2, 110, 150, False),
        ('24 V DC DIN‑rail power supply, 10 A', 'Valves and pump. Keeps mains voltage away from the wet area.', 2, 50, 120, False),
        ('Drip trays / drain covers', 'Under the pump station and manifold.', 1, 200, 600, False),
        ('UV water steriliser', 'Recommended if a tank is used (stops bacteria growing in standing water).', 1, 150, 400, True),
    ]),
    ('Safety & electrical', [
        ('Safety relay (Cat 3 / PL d)', 'e.g. Pilz PNOZ or Schneider Preventa. Monitors the E‑stop circuit.', 1, 200, 450, False),
        ('Emergency‑stop buttons (red mushroom, latching)', 'Operator desk, loading area, hall exit, equipment rack.', 4, 40, 90, False),
        ('Contactors, one per chair row', 'Cut chair power on E‑stop. Hardwired, independent of software.', 5, 100, 250, False),
        ('Effects + E‑stop control cabinet', 'DIN rail, terminals, breakers, labelling.', 1, 500, 1200, False),
        ('Low‑light IP cameras over the hall', 'Staff can watch every rider from the operator desk.', 2, 60, 200, False),
        ('Emergency lighting + exit signs', 'Hall is kept dim; riders must be able to get out in a power cut.', 1, 200, 600, False),
        ('First aid kit, sick bags, rules signage', 'Motion sickness happens. Plan for it.', 1, 100, 300, False),
    ]),
    ('Room fit‑out', [
        ('Waterproof anti‑slip vinyl flooring, ~130 m²', 'Mist + moving chairs; must be easy to dry and clean.', 130, 15, 40, False),
    ]),
]

OPTIONAL_CHAIRS = (25, 3000, 8000)


def bom_totals():
    out = []
    for cat, items in BOM:
        lo = sum(q * a for _, _, q, a, b, opt in items if not opt)
        hi = sum(q * b for _, _, q, a, b, opt in items)
        out.append((cat, lo, hi))
    return out


# ---------------------------------------------------------------------------
# diagrams

def box(g, x, y, w, h, title, sub=None, fill=SOFT, stroke=LINE, tc=INK):
    g.add(Rect(x, y, w, h, rx=5, ry=5, fillColor=fill, strokeColor=stroke, strokeWidth=0.8))
    ty = y + h / 2 + (3 if sub else -3)
    g.add(String(x + w / 2, ty, title, fontName='Sans-Bold', fontSize=7.6, fillColor=tc, textAnchor='middle'))
    if sub:
        g.add(String(x + w / 2, ty - 10, sub, fontName='Sans', fontSize=6.4, fillColor=MUTED, textAnchor='middle'))


def arrow(g, x1, y1, x2, y2, color=MUTED, width=1, dash=None, label=None, lx=None, ly=None):
    ln = Line(x1, y1, x2, y2, strokeColor=color, strokeWidth=width)
    if dash:
        ln.strokeDashArray = dash
    g.add(ln)
    import math
    a = math.atan2(y2 - y1, x2 - x1)
    s = 4.5
    g.add(Polygon([x2, y2, x2 - s * math.cos(a - 0.45), y2 - s * math.sin(a - 0.45),
                   x2 - s * math.cos(a + 0.45), y2 - s * math.sin(a + 0.45)], fillColor=color, strokeColor=color))
    if label:
        g.add(String(lx if lx is not None else (x1 + x2) / 2, ly if ly is not None else (y1 + y2) / 2 + 3, label,
                     fontName='Sans', fontSize=6.2, fillColor=color, textAnchor='middle'))


def system_diagram():
    W, H = 174 * mm, 96 * mm
    d = Drawing(W, H)
    # headsets
    box(d, 6, H - 52, 120, 40, '25 VR headsets', 'WebXR player · video = clock', fill=ACCENT_SOFT, stroke=ACCENT)
    box(d, 6, H - 112, 120, 40, '3 Wi‑Fi 7 access points', '6 GHz · ~8–9 headsets each')
    arrow(d, 66, H - 52, 66, H - 72, ACCENT, label='Wi‑Fi 6E', lx=92, ly=H - 64)
    # switch
    box(d, 180, H - 112, 140, 40, '48‑port PoE+ switch', '10G uplink to server')
    arrow(d, 126, H - 92, 180, H - 92, MUTED)
    # server
    box(d, 180, H - 52, 140, 40, 'Ride server PC', 'show engine · safety · drivers', fill=INK, stroke=INK, tc=colors.white)
    arrow(d, 250, H - 72, 250, H - 52, MUTED, label='10 GbE', lx=272, ly=H - 64)
    box(d, 360, H - 52, 125, 40, 'Operator dashboard', 'tablet + desk monitor')
    arrow(d, 320, H - 32, 360, H - 32, MUTED)
    # outputs
    y3 = H - 178
    box(d, 120, y3, 120, 40, '25 chair controllers', 'Ethernet (UDP) / serial', fill=colors.white)
    box(d, 255, y3, 110, 40, 'Fan relays', '5 row zones', fill=colors.white)
    box(d, 380, y3, 105, 40, 'Valve relays', 'master + 5 rows', fill=colors.white)
    arrow(d, 210, H - 112, 180, y3 + 40, MUTED)
    arrow(d, 250, H - 112, 310, y3 + 40, MUTED)
    arrow(d, 300, H - 112, 432, y3 + 40, MUTED)
    # e-stop
    box(d, 6, y3 - 58, 150, 40, 'Hardwired E‑stop circuit', '4 buttons → safety relay', fill=RED_SOFT, stroke=RED, tc=RED)
    box(d, 180, y3 - 58, 305, 40, 'Row contactors: cut chair, fan and pump power', 'works even if the PC or network fails', fill=RED_SOFT, stroke=RED, tc=RED)
    arrow(d, 156, y3 - 38, 180, y3 - 38, RED, width=1.4)
    return d


def floor_plan():
    W, H = 174 * mm, 150 * mm
    d = Drawing(W, H)
    sc = 30  # points per metre
    ox, oy = 14, 18
    hw, hd = 10.0, 13.0  # hall metres
    d.add(Rect(ox, oy, hw * sc, hd * sc, fillColor=colors.white, strokeColor=INK, strokeWidth=1.4))
    d.add(String(ox + hw * sc / 2, oy + hd * sc + 5, 'Ride hall  ~10 m × 13 m', fontName='Sans-Bold', fontSize=7.5, fillColor=INK, textAnchor='middle'))
    # seats 5×5 — riders face up the page (towards "front")
    pitch_x, pitch_y = 1.6, 2.0
    x0 = ox + (hw - 5 * pitch_x) / 2 * sc + 0.15 * sc
    y0 = oy + 1.6 * sc
    n = 1
    for r in range(5):
        for c in range(5):
            x = x0 + c * pitch_x * sc
            y = y0 + (4 - r) * pitch_y * sc
            d.add(Rect(x, y, 1.1 * sc, 1.2 * sc, rx=4, ry=4, fillColor=ACCENT_SOFT, strokeColor=ACCENT, strokeWidth=0.8))
            d.add(String(x + 0.55 * sc, y + 0.48 * sc, str(n), fontName='Sans-Bold', fontSize=8, fillColor=ACCENT, textAnchor='middle'))
            # fan + mist post in front of the seat
            d.add(Circle(x + 0.55 * sc, y + 1.2 * sc + 0.32 * sc, 3.2, fillColor=WATER, strokeColor=WATER))
            n += 1
        d.add(String(x0 - 6, y0 + (4 - r) * pitch_y * sc + 0.5 * sc, f'R{r + 1}', fontName='Sans', fontSize=6.5, fillColor=MUTED, textAnchor='end'))
    # access points
    # in the side aisles, spread front / middle / back
    for cx, cy in [(ox + 0.45 * sc, oy + 9.6 * sc), (ox + 9.55 * sc, oy + 6.2 * sc), (ox + 0.45 * sc, oy + 3.3 * sc)]:
        d.add(Polygon([cx, cy + 6, cx - 6, cy - 4, cx + 6, cy - 4], fillColor=GREEN, strokeColor=GREEN))
    # front marker
    d.add(String(ox + hw * sc / 2, oy + hd * sc - 12, '▲ riders face this way (front of the video, recenter direction)', fontName='Sans', fontSize=6.3, fillColor=MUTED, textAnchor='middle'))
    # operator desk at the back
    d.add(Rect(ox + 3.6 * sc, oy + 0.15 * sc, 2.8 * sc, 0.6 * sc, fillColor=INK, strokeColor=INK))
    d.add(String(ox + 5 * sc, oy + 0.38 * sc, 'Operator desk', fontName='Sans-Bold', fontSize=6.3, fillColor=colors.white, textAnchor='middle'))
    estops = [(ox + 6.6 * sc, oy + 0.45 * sc), (ox + hw * sc - 8, oy + hd * sc * 0.55), (ox + 8, oy + 0.6 * sc)]
    for ex, ey in estops:
        d.add(Circle(ex, ey, 4.2, fillColor=RED, strokeColor=colors.white, strokeWidth=0.8))
    # side panel
    px = ox + hw * sc + 14
    d.add(Rect(px, oy + 7.5 * sc, 150, 5.5 * sc, fillColor=SOFT, strokeColor=LINE))
    d.add(String(px + 75, oy + 12.6 * sc, 'Loading / queue  ~35 m²', fontName='Sans-Bold', fontSize=7, fillColor=INK, textAnchor='middle'))
    for i, t in enumerate(['lockers for bags & phones', 'safety briefing screen', 'headset fitting bench', 'UV‑C cabinet + charging']):
        d.add(String(px + 8, oy + 12.0 * sc - i * 11, '· ' + t, fontName='Sans', fontSize=6.5, fillColor=MUTED))
    d.add(Rect(px, oy + 2.5 * sc, 150, 4.5 * sc, fillColor=SOFT, strokeColor=LINE))
    d.add(String(px + 75, oy + 6.6 * sc, 'Control room  ~8 m²', fontName='Sans-Bold', fontSize=7, fillColor=INK, textAnchor='middle'))
    for i, t in enumerate(['12U rack: server, switch, UPS', 'effects + E‑stop cabinet', 'chair power board', 'pump station (drip tray)']):
        d.add(String(px + 8, oy + 6.0 * sc - i * 11, '· ' + t, fontName='Sans', fontSize=6.5, fillColor=MUTED))
    d.add(Circle(px + 140, oy + 6.75 * sc, 4.2, fillColor=RED, strokeColor=colors.white, strokeWidth=0.8))
    # legend
    ly = oy + 1.1 * sc
    items = [(ACCENT_SOFT, ACCENT, 'rect', 'motion chair (seat no.)'), (WATER, WATER, 'dot', 'fan + mist post'),
             (GREEN, GREEN, 'tri', 'Wi‑Fi access point (ceiling)'), (RED, RED, 'dot', 'emergency‑stop button')]
    for i, (f, s, kind, t) in enumerate(items):
        yy = ly + (3 - i) * 12
        if kind == 'rect':
            d.add(Rect(px, yy - 3, 9, 8, fillColor=f, strokeColor=s))
        elif kind == 'tri':
            d.add(Polygon([px + 4.5, yy + 5, px, yy - 3, px + 9, yy - 3], fillColor=f, strokeColor=s))
        else:
            d.add(Circle(px + 4.5, yy + 1, 3.8, fillColor=f, strokeColor=s))
        d.add(String(px + 14, yy - 1, t, fontName='Sans', fontSize=6.5, fillColor=INK))
    d.add(String(ox, oy - 11, 'Seat pitch ~1.6 m, row pitch ~2.0 m (check against your chair’s footprint + motion clearance). Aisles ≥ 1.2 m on both sides.',
                 fontName='Sans', fontSize=6.3, fillColor=MUTED))
    return d


def water_diagram():
    W, H = 174 * mm, 52 * mm
    d = Drawing(W, H)
    y = H - 50
    steps = [('Mains / 50 L tank', 'float valve'), ('Filter set', '5 µm + carbon'), ('Pump', '24 V · 100–150 psi'),
             ('Accumulator', '+ gauge'), ('Master valve', 'NC · 24 V')]
    x = 4
    for i, (t, s) in enumerate(steps):
        box(d, x, y, 80, 34, t, s, fill=colors.white, stroke=WATER)
        if i < len(steps) - 1:
            arrow(d, x + 80, y + 17, x + 92, y + 17, WATER)
        x += 92
    # manifold to rows
    mx = x - 92 + 40
    d.add(Line(mx, y, mx, y - 22, strokeColor=WATER, strokeWidth=1.2))
    d.add(Line(40, y - 22, mx, y - 22, strokeColor=WATER, strokeWidth=1.2))
    for i in range(5):
        rx = 40 + i * ((mx - 40) / 4)
        box(d, rx - 34, y - 70, 68, 30, f'Row {i + 1} valve', '→ 5 nozzles', fill=colors.white, stroke=WATER)
        d.add(Line(rx, y - 22, rx, y - 40, strokeColor=WATER, strokeWidth=1.2))
    return d


def estop_diagram():
    W, H = 174 * mm, 50 * mm
    d = Drawing(W, H)
    y = H - 46
    for i, t in enumerate(['Desk', 'Loading', 'Exit', 'Rack']):
        d.add(Circle(18 + i * 34, y + 14, 9, fillColor=RED, strokeColor=RED))
        d.add(String(18 + i * 34, y - 6, t, fontName='Sans', fontSize=6.3, fillColor=MUTED, textAnchor='middle'))
        if i:
            d.add(Line(27 + (i - 1) * 34, y + 14, 9 + i * 34, y + 14, strokeColor=RED, strokeWidth=1.2))
    d.add(String(68, y + 30, 'buttons in series (2 channels)', fontName='Sans', fontSize=6.3, fillColor=RED, textAnchor='middle'))
    box(d, 150, y, 90, 30, 'Safety relay', 'Cat 3 / PL d', fill=RED_SOFT, stroke=RED, tc=RED)
    arrow(d, 129, y + 14, 150, y + 14, RED, width=1.2)
    box(d, 270, y + 20, 110, 26, 'Contactors K1–K5', 'chair power, rows 1–5', fill=colors.white, stroke=RED)
    box(d, 270, y - 14, 110, 26, 'Effects contactor', 'fans + pump + 24 V valves', fill=colors.white, stroke=RED)
    arrow(d, 240, y + 18, 270, y + 33, RED)
    arrow(d, 240, y + 10, 270, y - 1, RED)
    box(d, 400, y + 3, 85, 26, 'Status → server', 'optional relay input', fill=colors.white, stroke=LINE)
    arrow(d, 380, y + 16, 400, y + 16, MUTED, dash=[2, 2])
    return d


# ---------------------------------------------------------------------------
# page furniture

def on_page(c, doc):
    c.saveState()
    if doc.page > 1:
        c.setFont('Sans', 7)
        c.setFillColor(MUTED)
        c.drawString(18 * mm, 10 * mm, 'NASR VR Ride · Hardware plan for 25 riders')
        c.drawRightString(A4[0] - 18 * mm, 10 * mm, f'Page {doc.page}')
        c.setStrokeColor(LINE)
        c.line(18 * mm, 14 * mm, A4[0] - 18 * mm, 14 * mm)
    c.restoreState()


def cover(c, doc):
    c.saveState()
    w, h = A4
    c.setFillColor(INK)
    c.rect(0, h - 128 * mm, w, 128 * mm, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(18 * mm, h - 40 * mm, 18 * mm, 2.2 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont('Sans', 11)
    c.drawString(18 * mm, h - 33 * mm, 'NASR VR RIDE')
    c.setFont('Sans-Bold', 30)
    c.drawString(18 * mm, h - 62 * mm, 'Hardware plan')
    c.drawString(18 * mm, h - 75 * mm, 'for 25 riders at once')
    c.setFont('Sans', 11)
    c.setFillColor(colors.HexColor('#b8c0d8'))
    c.drawString(18 * mm, h - 90 * mm, 'VR headsets · network · motion chairs · wind · water · safety · room')
    c.drawString(18 * mm, h - 98 * mm, 'Bill of materials, diagrams, budget and operating plan')
    c.setFont('Sans', 8.5)
    c.drawString(18 * mm, h - 118 * mm, 'Prepared October 2026 · prices are estimates in USD (SAR at 3.75) — confirm with local suppliers')
    c.restoreState()


# ---------------------------------------------------------------------------

def build():
    doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=20 * mm,
                          title='NASR VR Ride — Hardware plan for 25 riders', author='NASR')
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
    cover_frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, A4[1] - 128 * mm - doc.bottomMargin - 10 * mm, id='c')
    doc.addPageTemplates([PageTemplate('cover', [cover_frame], onPage=cover), PageTemplate('main', [frame], onPage=on_page)])

    totals = bom_totals()
    lo = sum(t[1] for t in totals)
    hi = sum(t[2] for t in totals)
    q3s_saving = 30 * (600 - 350)

    st = []
    from reportlab.platypus import NextPageTemplate
    st.append(NextPageTemplate('main'))

    # ---- cover body: key numbers
    tiles = [
        ('25 + 5', 'VR headsets\n(25 riders + 5 spares)'),
        (f'${lo / 1000:.0f}k–{hi / 1000:.0f}k', 'Hardware budget (USD),\nexcluding the chairs'),
        ('4–5 shows/h', '≈ 100–125 riders per hour\nwith 5–8 min experiences'),
        ('~175 m²', 'hall + loading + control room'),
    ]
    cells = [[Paragraph(f'<font name="Sans-Bold" size="15" color="#2f6fe4">{a}</font><br/><font size="7.8" color="#5c6475">{b.replace(chr(10), "<br/>")}</font>',
                        ParagraphStyle('t', fontName='Sans', leading=17)) for a, b in tiles]]
    t = Table(cells, colWidths=[43.5 * mm] * 4)
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), SOFT), ('BOX', (0, 0), (-1, -1), 0.5, LINE),
                           ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.white), ('TOPPADDING', (0, 0), (-1, -1), 9),
                           ('BOTTOMPADDING', (0, 0), (-1, -1), 10), ('LEFTPADDING', (0, 0), (-1, -1), 8), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
    st += [Spacer(1, 4), t, Spacer(1, 12)]
    st.append(P('What this document covers', 'h2'))
    st += bullets([
        'Everything you need to buy so <b>25 people can ride at the same time</b>: headsets and rider kit, the Wi‑Fi network and ride server, '
        'connecting and powering the motion chairs, the wind and water effects, the emergency‑stop system, and the room.',
        'Quantities include sensible spares. Every line says <b>why</b> it is needed, so you can swap in local equivalents.',
        'Diagrams: system overview, hall floor plan, water system and emergency‑stop circuit.',
        'The software (NASR VR Ride, already built) runs all 25 seats from one PC: each chair follows its own headset’s video.',
    ])
    st.append(callout('<b>Your chairs.</b> You already have motion chairs (xyz movement + vibration), so they are '
                      '<b>not</b> in the budget. If you need more to reach 25, commercial single‑seat VR motion chairs cost roughly '
                      f'{money(OPTIONAL_CHAIRS[1])}–{money(OPTIONAL_CHAIRS[2])} each '
                      f'(≈ {money(OPTIONAL_CHAIRS[0] * OPTIONAL_CHAIRS[1])}–{money(OPTIONAL_CHAIRS[0] * OPTIONAL_CHAIRS[2])} for 25).', 'info'))

    # ---- 1. overview
    st.append(PageBreak())
    st.append(P('1. How the system fits together', 'h1'))
    st.append(P('Every rider wears a standalone VR headset that plays the ride video. The headset tells the ride server where it is in the '
                'video ten times a second, and the server moves that rider’s chair, fan and mist to match. The headsets need no cables. '
                'Everything else (chairs, fan and valve relays) is wired to one network switch. The emergency stop is a separate '
                '<b>hardwired</b> circuit that cuts power to the chairs and effects even if the PC or network fails.'))
    st.append(system_diagram())
    st.append(Spacer(1, 6))
    st.append(P('Design assumptions', 'h2'))
    st.append(grid([
        ['Item', 'Assumption used in this plan', 'If different'],
        ['Group size', '25 riders per show, all watching the same experience in sync', 'Software also supports fewer seats per show'],
        ['Show length', '5–8 minutes + ~5 minutes to load/unload and fit headsets', 'Longer shows → fewer riders/hour, more battery use'],
        ['Video', '360° stereo up to 5.7K, H.265 at ~30–40 Mbps', '8K needs PC‑VR headsets (much higher cost)'],
        ['Chairs', 'Your existing chairs, 1 per rider, controller reachable by Ethernet or USB/serial', 'Send the chair model, and I’ll adapt the driver'],
        ['Power', '3‑phase supply available; chairs ~1–2 kW peak each (confirm on the nameplate)', 'Electrician sizes the board from real figures'],
        ['Operating day', 'Up to 10–12 hours, staff of 1 operator + 3 attendants', ''],
    ], [30, 85, 59]))

    # ---- 2. headsets
    st.append(PageBreak())
    st.append(P('2. VR headsets & rider kit', 'h1'))
    st.append(P('<b>Recommendation: Meta Quest 3 (512 GB).</b> For watching 360° video, lens clarity matters more than anything else. Quest 3’s pancake lenses are '
                'sharp edge to edge, it has a 3.5 mm headphone jack, Wi‑Fi 6E for the uncrowded 6 GHz band, and since February 2026 every consumer Quest '
                'can be enrolled in Meta’s device management (kiosk lock, remote setup) at no extra cost.'))
    st.append(grid([
        ['', 'Meta Quest 3 (512 GB) — recommended', 'Meta Quest 3S (128 GB) — budget'],
        ['US price (since 19 Apr 2026)', '$599.99', '$349.99'],
        ['Lenses / clarity', 'Pancake, sharp across the view, 2064×2208 per eye', 'Fresnel, softer edges, 1832×1920 per eye'],
        ['Headphone jack', 'Yes, 3.5 mm', 'No (USB‑C headphones or adapter needed)'],
        ['Wi‑Fi', 'Wi‑Fi 6E (6 GHz)', 'Wi‑Fi 6E (6 GHz)'],
        ['30 units', money(30 * 600), money(30 * 350)],
        ['Verdict', 'Best picture: riders notice sharpness in 360° video', f'Saves about {money(q3s_saving)}; acceptable for short rides'],
    ], [38, 70, 66]))
    st.append(Spacer(1, 6))
    st.append(P('Why 30 headsets for 25 seats', 'h2'))
    st += bullets([
        '5 spares (20%) cover drops, a cracked lens, a headset that won’t connect, or one being cleaned. A show should never start with an empty seat.',
        '<b>Battery:</b> a Quest 3 runs about 2–2.5 h of video. With a hot‑swap battery strap, staff swap a charged pack between shows in 10 seconds, '
        'so headsets stay in VR mode all day and charge fully overnight in the cabinet.',
        '<b>Hygiene:</b> every rider gets a disposable eye mask; facial interfaces are wiped and rotated (2 per headset); headsets + headphones go through '
        'the UV‑C cabinet between groups.',
        '<b>Audio:</b> headphones, not the built‑in speakers. With 25 headsets in one room, tiny timing differences between them sound like an echo.',
    ])
    st.append(callout('<b>Keep the water off the headsets.</b> Quest headsets are not waterproof. Mist nozzles must be aimed at the hands, neck and lower face, '
                      'never straight at the lenses, and the mist must be fine (see section 6).', 'warn'))

    # ---- 3. network
    st.append(PageBreak())
    st.append(P('3. Network & ride server', 'h1'))
    st.append(P('Twenty‑five headsets streaming high‑bitrate video at once is the most demanding part of the system. The plan keeps the headsets on '
                'their own clean 6 GHz Wi‑Fi, spread over three access points, with a 10 Gb link from the server so the server is never the bottleneck.'))
    st.append(grid([
        ['Calculation', 'Value'],
        ['Video bitrate per headset (5.7K 360° H.265)', '30–40 Mbps'],
        ['All 25 headsets playing', '≈ 0.75–1.0 Gbps total'],
        ['Per access point (3 APs, ~8–9 headsets each)', '≈ 250–350 Mbps — comfortable for one 160 MHz 6 GHz channel'],
        ['Server link', '10 GbE (minimum 2.5 GbE)'],
        ['Chair control traffic (25 chairs × 60 updates/s)', '< 1 Mbps, wired, negligible'],
    ], [100, 74]))
    st.append(Spacer(1, 6))
    st += bullets([
        'Give the headsets their own <b>6 GHz‑only SSID</b> with no internet and no guests. Put staff devices on 5 GHz, and chairs and relays on a separate wired network (VLAN).',
        'Mount the 3 access points on the ceiling above the side aisles (front, middle, back; see the floor plan) on <b>non‑overlapping 160 MHz channels</b>. Turn transmit power down to medium, so each headset sticks to its nearest access point.',
        'Install the ride software on the backup PC with the same content and config. If the main PC fails, swap the network cable and carry on.',
        'Content tip: encode videos with <i>faststart</i> (see the software README). Shorter loading times mean shorter gaps between shows.',
    ])

    # ---- 4. chairs
    st.append(PageBreak())
    st.append(P('4. Motion chairs: control & power', 'h1'))
    st.append(P('The software sends each chair its target position (pitch, roll, yaw, heave, surge, sway, vibration) 60 times a second. It works with '
                'most chairs in one of three ways:'))
    st.append(grid([
        ['Your chair’s controller…', 'Connect it like this', 'Extra hardware'],
        ['Has an Ethernet port / runs its own motion software (FlyPT Mover, SimTools, vendor software)', 'Ride server → UDP over the wired network', 'None (Cat6 drop to each chair)'],
        ['Is USB / serial only (Arduino, SMC3, Thanos AMC, many Chinese 9D chairs)', 'Serial‑to‑Ethernet converter at each chair, UDP mode', '25 converters (optional line in the budget)'],
        ['Uses a proprietary protocol', 'Send me the model + protocol document; I add a driver', 'Usually none'],
    ], [62, 62, 50]))
    st.append(Spacer(1, 6))
    st.append(P('Power', 'h2'))
    st += bullets([
        'Check the nameplate of one chair for <b>peak</b> power. Typical 2–3‑axis electric chairs draw 1–2 kW peak, which is roughly 25–50 kW for 25 chairs if all move hard at once. '
        'Because everyone watches the same video, <b>all chairs do move together</b>, so size for that.',
        'Use a dedicated 3‑phase distribution board with a breaker per 2–3 chairs, 30 mA RCD protection, and the chairs split into 5 row circuits (rows 1–5). '
        'Each row passes through an E‑stop contactor (section 7).',
        'Bolt every chair to the slab. Run cables in floor ducts or trenches, never loose across the floor. Use flexible, strain‑relieved cable where it enters the moving part of the chair.',
        'Have a licensed electrician design and sign off the installation.',
    ])
    st.append(callout('<b>Before buying more chairs:</b> make sure every chair has a seat belt or lap bar, a physical end stop on every axis, and overload protection. '
                      'Software limits (already built in) are a second layer, not the first.', 'warn'))

    # ---- 5. wind
    st.append(P('5. Wind effects', 'h1'))
    st += bullets([
        '<b>One compact fan per seat</b>, on a floor post 60–80 cm in front of the rider at chest height. A few big fans at the front would blast row 1 and leave row 5 with nothing.',
        'Wire the fans in <b>5 row circuits</b> switched by 2 × Shelly Pro 4PM relays (DIN rail, Ethernet). The software already speaks to Shelly, and the 3 spare channels can run extra effects later (scent, heat lamps).',
        'On/off fans are cheapest and work well. For variable wind (a breeze that builds to a gale), choose EC/DC fans with 0–10 V or PWM speed control; the software already outputs fan level 0–100%.',
        'The same post carries the mist nozzle (section 6), so you install one post per seat, not two.',
    ])

    # ---- 6. water
    st.append(CondPageBreak(110 * mm))
    st.append(P('6. Water effects (mist)', 'h1'))
    st.append(P('Use a <b>fine mist</b> from a 100–150 psi misting system. It gives a strong “splash” feeling, dries in seconds, and uses very little water: '
                'about 0.1 L per nozzle per minute of spraying. Normal garden sprinkler pressure would soak riders and headsets.'))
    st.append(water_diagram())
    st.append(Spacer(1, 4))
    st += bullets([
        '<b>Normally‑closed 24 V valves:</b> if power or the PC fails, the water stops. A master valve plus one valve per row means two valves must fail before water flows.',
        '<b>Anti‑drip nozzles:</b> a check valve in each nozzle stops dripping after a burst.',
        '<b>Three layers of limits:</b> (1) the software caps each burst at 1.5 s, forces a gap between bursts and sets a maximum per show; '
        '(2) the Shelly relays have an auto‑off timer; (3) the E‑stop cuts valve power.',
        '<b>Hygiene:</b> use drinking‑quality water and never let it stand warm. Flush the lines daily, clean the tank weekly, and add a UV steriliser if you use a tank.',
        '<b>Electrical:</b> only 24 V reaches the seats. Mains voltage stays in the control cabinet, and the pump sits in a drip tray.',
    ])

    # ---- 7. safety
    st.append(PageBreak())
    st.append(P('7. Safety & emergency stop', 'h1'))
    st.append(P('The software already parks every chair smoothly on E‑stop, if a headset disconnects, or if a rider takes the headset off. '
                'It also cuts fans and water and shows a “Ride paused, please stay seated” message inside every headset. '
                '<b>A hardwired emergency‑stop circuit is still mandatory</b>, because software can’t protect anyone if the PC itself has failed.'))
    st.append(estop_diagram())
    st.append(Spacer(1, 4))
    st += bullets([
        '4 latching red mushroom buttons: operator desk, loading area, hall exit and the equipment rack. All are wired in series into a safety relay (Category 3 / PL d).',
        'The safety relay drops 5 row contactors (chair power) and 1 effects contactor (fans, pump, 24 V valves). Restarting needs a deliberate reset by the operator.',
        'Optional: wire a spare contact from the safety relay to a relay input, so the dashboard shows when the hardware E‑stop has been pressed.',
        '2 low‑light cameras over the hall, shown on the operator desk. Riders can’t see the staff, so staff must be able to see every rider.',
        'Emergency lighting, clear exit routes, height/age/health rules at the entrance, a first aid kit and sick bags.',
    ])
    st.append(callout('<b>Get it approved.</b> Ask the motion‑chair maker for their safety requirements, and have the electrical design, E‑stop circuit and water installation '
                      'checked by a qualified engineer and the local civil‑defence / entertainment authority before opening to the public.', 'danger'))

    # ---- 8. room
    st.append(PageBreak())
    st.append(P('8. Room & floor plan', 'h1'))
    st.append(floor_plan())
    st.append(Spacer(1, 4))
    st.append(grid([
        ['Requirement', 'Recommendation'],
        ['Floor area', 'Ride hall ~130 m² (10 × 13 m) + loading/queue ~35 m² + control room ~8 m²'],
        ['Floor', 'Concrete slab for chair anchoring; waterproof anti‑slip vinyl on top; floor ducts for power and Cat6'],
        ['Ceiling', '≥ 2.7 m clear (access points, cameras, cable trays)'],
        ['Cooling', '25 riders + 25 chairs + equipment ≈ 8–12 kW of heat. Size the AC with an HVAC engineer and add dehumidification because of the mist'],
        ['Lighting', 'Dim, even lighting (headset tracking needs some light); emergency lighting on separate circuits'],
        ['Layout', 'Riders face the same wall: that’s the “front” of the video. Flat floor; no screens or sight lines needed'],
    ], [32, 142]))

    # ---- 9. operations
    st.append(PageBreak())
    st.append(P('9. Operating the hall', 'h1'))
    st.append(grid([
        ['Step', 'What happens', 'Time'],
        ['1. Queue', 'Safety briefing video; bags and phones into lockers; disposable eye masks handed out', 'during previous show'],
        ['2. Seat', 'Riders sit, belts on; attendants fit headsets + headphones (≈ 8 riders per attendant)', '3–4 min'],
        ['3. Check', 'Dashboard shows all 25 seats “ready · in VR · on head”; operator presses Start', '30 s'],
        ['4. Ride', 'Video, motion, wind and mist in sync; operator watches the cameras and dashboard', '5–8 min'],
        ['5. Exit', 'Chairs park automatically; headsets collected → wipe → UV‑C; battery packs swapped as needed', '2–3 min'],
    ], [22, 120, 32]))
    st.append(Spacer(1, 6))
    st.append(P('Staff per shift: 1 operator (dashboard, E‑stop, cameras) and 3 attendants (fitting, belts, cleaning). '
                'Throughput is about 4–5 shows an hour, or 100–125 riders an hour.'))
    st.append(P('Daily checklist', 'h2'))
    st += bullets([
        'Open: power on the rack, then the chairs. Run <b>Test chair</b> on every seat with nobody seated, and test the fans and mist with the dashboard test buttons.',
        'Check the battery levels on the dashboard; charged packs go to the swap tray.',
        'Close: headsets into the charging cabinet, flush the water lines, wipe all facial interfaces, check the logs for any seat faults.',
    ])

    # ---- 10. budget
    st.append(PageBreak())
    st.append(P('10. Budget summary', 'h1'))
    st.append(P('Hardware estimates in USD, before VAT, shipping and import duty. Installation labour is included only where marked “installed”. '
                'The low figure excludes optional lines, the high figure includes them. Local prices in Saudi Arabia may be higher than US list prices.'))
    rows = [['Category', 'Low', 'High', 'Low (SAR)', 'High (SAR)']]
    for cat, a, b in totals:
        rows.append([cat, money(a), money(b), f'{a * SAR:,.0f}', f'{b * SAR:,.0f}'])
    rows.append(['Total hardware (excluding chairs)', money(lo), money(hi), f'{lo * SAR:,.0f}', f'{hi * SAR:,.0f}'])
    st.append(grid(rows, [74, 25, 25, 25, 25], bold_last=True))
    st.append(Spacer(1, 8))
    st.append(grid([
        ['Adjustments', 'Effect on total'],
        ['Use Quest 3S instead of Quest 3', f'− about {money(q3s_saving)} (plus ~$10 per headset for USB‑C headphones/adapters)'],
        ['Buy 25 motion chairs (if not owned)', f'+ {money(OPTIONAL_CHAIRS[0] * OPTIONAL_CHAIRS[1])} to {money(OPTIONAL_CHAIRS[0] * OPTIONAL_CHAIRS[2])}'],
        ['Not included', 'HVAC, building works, decoration/theming, 360° content production or licences, permits, staff'],
        ['Contingency', 'Add 10–15% for cables, fixings and things found on site'],
    ], [60, 114]))

    # ---- 11. full BOM
    st.append(PageBreak())
    st.append(P('11. Full bill of materials', 'h1'))
    st.append(P('“Opt.” = only needed in some setups (see the reason). Unit prices are low–high estimates in USD.', 'small'))
    st.append(Spacer(1, 4))
    for cat, items in BOM:
        rows = [['Item', 'Why / spec', 'Qty', 'Unit (USD)', 'Total (USD)']]
        for name, why, q, a, b, opt in items:
            unit = f'{a:,.2f}–{b:,.2f}' if a < 1 else f'{a:,.0f}–{b:,.0f}'
            rows.append([name + (' <font color="#b66a00">(opt.)</font>' if opt else ''), why, f'{q:,}', unit,
                         f'{money(q * a)}–{money(q * b)}'])
        st.append(KeepTogether([P(cat, 'h2'), grid(rows, [42, 72, 12, 22, 26])]))

    # ---- 12. next steps
    st.append(PageBreak())
    st.append(P('12. Next steps', 'h1'))
    st.append(grid([
        ['#', 'Action', 'Who'],
        ['1', 'Send the chair model, controller type and nameplate power. I’ll confirm the connection method and add a driver if needed', 'You → me'],
        ['2', 'Order 2 headsets + 1 access point first; test your real videos on them at the venue', 'You'],
        ['3', 'Electrician + HVAC engineer survey the hall (power, cooling, floor ducts)', 'You'],
        ['4', 'Install 1 full row (5 seats) with fans + mist; run the software end to end for a week', 'You + me'],
        ['5', 'Roll out the remaining 4 rows; safety inspection; staff training; soft opening', 'You'],
    ], [8, 140, 26]))
    st.append(Spacer(1, 8))
    st.append(P('Sources for prices', 'h2'))
    st.append(P('Meta Quest pricing update, 19 April 2026 (Quest 3 512 GB $599.99, Quest 3S 128 GB $349.99): meta.com/blog/update-meta-quest-pricing · '
                'Meta for Work update, Feb 2026 (all consumer Quest 3/3S enrollable in Horizon Managed Solutions at no cost): forwork.meta.com · '
                'Shelly Pro 4PM: us.shelly.com · Ubiquiti U7 Pro launch price $189. Other prices are typical 2026 market ranges; confirm with your local suppliers.', 'small'))

    doc.build(st)
    print(OUT)


if __name__ == '__main__':
    build()
