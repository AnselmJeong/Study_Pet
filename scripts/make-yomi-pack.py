#!/usr/bin/env python3
# 요미 샘플 팩의 SVG 프레임을 만든다: python3 scripts/make-yomi-pack.py <출력폴더>
# PNG는 SVG를 투명 배경으로 2배 렌더한 것 (브라우저나 rsvg-convert 등 아무 도구나 OK)
# 요미(Yomi): 오리지널 치비 캐릭터 SVG 프레임 생성기
import os, sys, json
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

SKIN="#ffe6d6"; SKIN_SH="#f6c9b6"; HAIR="#2e2438"; HAIR_HI="#4a3b5c"
CARD="#f3e7cf"; CARD_SH="#dccaa8"; SHIRT="#ffffff"; SKIRT="#3b4a7a"; SKIRT_SH="#2c375e"
TIE="#d8443c"; TIGHTS="#3a3346"; SHOE="#5a3a2c"; IRIS1="#7a5cc8"; IRIS2="#3a2a78"; LINE="#2a2030"

def defs():
    return f'''<defs>
<linearGradient id="iris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{IRIS2}"/><stop offset="1" stop-color="{IRIS1}"/></linearGradient>
<linearGradient id="hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{HAIR_HI}"/><stop offset="1" stop-color="{HAIR}"/></linearGradient>
</defs>'''

def legs(walk=0):
    a = 3*walk
    return f'''<g>
<rect x="{80+a}" y="212" width="15" height="34" rx="6" fill="{TIGHTS}"/>
<rect x="{105-a}" y="212" width="15" height="34" rx="6" fill="{TIGHTS}"/>
<ellipse cx="{86+a}" cy="248" rx="11" ry="6" fill="{SHOE}"/>
<ellipse cx="{114-a}" cy="248" rx="11" ry="6" fill="{SHOE}"/>
</g>'''

def body():
    return f'''<g>
<path d="M66 196 L134 196 L142 222 Q100 230 58 222 Z" fill="{SKIRT}"/>
<path d="M78 198 L74 224 M92 198 L91 227 M108 198 L109 227 M122 198 L126 224" stroke="{SKIRT_SH}" stroke-width="2"/>
<rect x="92" y="134" width="16" height="16" rx="4" fill="{SKIN_SH}"/>
<path d="M72 150 Q100 140 128 150 L134 200 Q100 206 66 200 Z" fill="{CARD}"/>
<path d="M90 146 L100 176 L110 146 Z" fill="{SHIRT}"/>
<path d="M96 156 L104 156 L106 174 L100 180 L94 174 Z" fill="{TIE}"/>
<path d="M100 176 L100 202" stroke="{CARD_SH}" stroke-width="2"/>
<circle cx="104" cy="186" r="2" fill="{CARD_SH}"/><circle cx="104" cy="196" r="2" fill="{CARD_SH}"/>
</g>'''

def arm_down(side):
    # side -1 왼쪽(화면 기준), 1 오른쪽
    x = 100 + side*31
    return f'''<g><path d="M{x-side*2} 152 Q{x+side*12} 172 {x+side*10} 196" stroke="{CARD}" stroke-width="16" stroke-linecap="round" fill="none"/>
<circle cx="{x+side*10}" cy="200" r="7" fill="{SKIN}"/></g>'''

def arm_wave(phase):
    ang = -8 if phase==0 else 14
    return f'''<g transform="rotate({ang} 130 154)"><path d="M130 154 Q160 150 168 118" stroke="{CARD}" stroke-width="16" stroke-linecap="round" fill="none"/>
<path d="M130 154 Q160 150 168 118" stroke="{CARD_SH}" stroke-width="1.5" fill="none" opacity="0.6"/>
<circle cx="169" cy="108" r="9" fill="{SKIN}"/><path d="M163 100 l-2 -6 M169 99 l0 -7 M175 100 l2 -6" stroke="{SKIN_SH}" stroke-width="3" stroke-linecap="round"/></g>'''

def arm_chin():
    return f'''<g><path d="M131 152 Q140 176 118 170" stroke="{CARD}" stroke-width="16" stroke-linecap="round" fill="none"/>
<circle cx="114" cy="150" r="7" fill="{SKIN}"/></g>'''

def book(page=0):
    tilt = "" if page==0 else ""
    return f'''<g>
<path d="M60 172 Q80 164 100 172 L100 204 Q80 196 60 204 Z" fill="#fbf4e2" stroke="#8a5a3a" stroke-width="2"/>
<path d="M140 172 Q120 164 100 172 L100 204 Q120 196 140 204 Z" fill="#fffaf0" stroke="#8a5a3a" stroke-width="2"/>
<path d="M68 180 l24 -3 M68 187 l24 -3 M108 177 l24 3 M108 184 l24 3 M108 191 l18 2" stroke="#c9b48a" stroke-width="1.6"/>
{'<path d="M100 172 Q118 160 130 168 L128 198 Q114 192 100 204 Z" fill="#fffdf6" stroke="#8a5a3a" stroke-width="1.5"/>' if page else ''}
<circle cx="62" cy="190" r="7" fill="{SKIN}"/><circle cx="138" cy="190" r="7" fill="{SKIN}"/>
<path d="M70 152 Q58 170 62 186 M130 152 Q142 170 138 186" stroke="{CARD}" stroke-width="15" stroke-linecap="round" fill="none"/>
</g>'''

def hair_back():
    return f'<path d="M38 96 Q34 34 100 30 Q166 34 162 96 L166 146 Q150 152 138 140 L62 140 Q50 152 34 146 Z" fill="url(#hair)"/>'

def head():
    return f'''<g>
<ellipse cx="100" cy="98" rx="58" ry="54" fill="{SKIN}"/>
</g>'''

def bangs():
    return f'''<g>
<path d="M40 100 Q40 40 100 38 Q160 40 160 100 Q150 76 138 72 Q136 86 124 92 Q122 76 112 70 Q106 88 92 90 Q94 76 86 70 Q76 88 62 92 Q64 78 58 76 Q46 84 40 100 Z" fill="url(#hair)"/>
<path d="M40 96 Q36 120 44 140 Q48 120 50 104 Z M160 96 Q164 120 156 140 Q152 120 150 104 Z" fill="{HAIR}"/>
<path d="M70 50 Q90 42 112 46" stroke="#6a5a80" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.7"/>
</g>'''

def hairpin():
    # 연필 모양 머리핀 (요미의 상징)
    return f'''<g transform="rotate(-35 140 60)">
<rect x="128" y="55" width="26" height="9" rx="2" fill="#f2c14e"/>
<rect x="124" y="55" width="6" height="9" rx="2" fill="#f19aa8"/>
<path d="M154 55 L162 59.5 L154 64 Z" fill="#f4d9b0"/><path d="M159 57.8 L162 59.5 L159 61.2 Z" fill="{LINE}"/>
</g>'''

def eye(cx, cy, kind="open", look=(0,0)):
    lx, ly = look
    if kind == "open":
        return f'''<g>
<ellipse cx="{cx}" cy="{cy}" rx="11" ry="14" fill="#fff"/>
<ellipse cx="{cx+lx}" cy="{cy+1+ly}" rx="9" ry="12" fill="url(#iris)"/>
<ellipse cx="{cx+lx}" cy="{cy+3+ly}" rx="4.5" ry="6" fill="{IRIS2}"/>
<circle cx="{cx-3+lx}" cy="{cy-4+ly}" r="3.6" fill="#fff"/>
<circle cx="{cx+4+lx}" cy="{cy+6+ly}" r="1.6" fill="#fff" opacity="0.9"/>
<path d="M{cx-13} {cy-10} Q{cx} {cy-19} {cx+13} {cy-10}" stroke="{LINE}" stroke-width="3.2" stroke-linecap="round" fill="none"/>
</g>'''
    if kind == "closed":
        return f'<path d="M{cx-11} {cy+2} Q{cx} {cy+9} {cx+11} {cy+2}" stroke="{LINE}" stroke-width="3" stroke-linecap="round" fill="none"/>'
    if kind == "happy":
        return f'<path d="M{cx-11} {cy+4} Q{cx} {cy-9} {cx+11} {cy+4}" stroke="{LINE}" stroke-width="3.4" stroke-linecap="round" fill="none"/>'
    if kind == "down":
        return f'''<g><ellipse cx="{cx}" cy="{cy+4}" rx="10" ry="7" fill="#fff"/>
<ellipse cx="{cx}" cy="{cy+6}" rx="8" ry="6" fill="url(#iris)"/><circle cx="{cx-2}" cy="{cy+4}" r="2" fill="#fff"/>
<path d="M{cx-12} {cy} Q{cx} {cy-4} {cx+12} {cy}" stroke="{LINE}" stroke-width="3.2" stroke-linecap="round" fill="none"/></g>'''
    if kind == "worry":
        return f'''<g><ellipse cx="{cx}" cy="{cy+2}" rx="9" ry="11" fill="#fff"/>
<ellipse cx="{cx}" cy="{cy+3}" rx="6" ry="8" fill="url(#iris)"/><circle cx="{cx-2}" cy="{cy}" r="2.2" fill="#fff"/>
<path d="M{cx-12} {cy-9} Q{cx} {cy-14} {cx+12} {cy-9}" stroke="{LINE}" stroke-width="3" stroke-linecap="round" fill="none"/></g>'''

def brows(kind="normal"):
    if kind == "worry":
        return f'<path d="M66 70 L84 76 M134 70 L116 76" stroke="{HAIR}" stroke-width="3" stroke-linecap="round"/>'
    if kind == "think":
        return f'<path d="M66 74 Q76 68 86 72 M114 70 Q124 66 134 70" stroke="{HAIR}" stroke-width="3" stroke-linecap="round" fill="none"/>'
    return ""

def mouth(kind="smile"):
    m = {
        "smile": f'<path d="M93 124 Q100 130 107 124" stroke="{LINE}" stroke-width="2.6" stroke-linecap="round" fill="none"/>',
        "open": f'<path d="M92 122 Q100 136 108 122 Z" fill="#b8434f" stroke="{LINE}" stroke-width="2"/><path d="M95 129 Q100 133 105 129" fill="#f08a94"/>',
        "small": f'<ellipse cx="100" cy="126" rx="3.5" ry="3" fill="#b8434f" stroke="{LINE}" stroke-width="1.6"/>',
        "big": f'<path d="M88 120 Q100 140 112 120 Z" fill="#b8434f" stroke="{LINE}" stroke-width="2"/><path d="M93 130 Q100 136 107 130" fill="#f08a94"/>',
        "wavy": f'<path d="M91 127 q3 -3 6 0 q3 3 6 0 q3 -3 6 0" stroke="{LINE}" stroke-width="2.4" stroke-linecap="round" fill="none"/>',
        "flat": f'<path d="M95 126 L105 126" stroke="{LINE}" stroke-width="2.4" stroke-linecap="round"/>',
        "sleep": f'<ellipse cx="100" cy="127" rx="3" ry="2.2" fill="#b8434f"/>',
    }
    return m[kind]

def blush(strong=False):
    o = 0.75 if strong else 0.5
    return f'<g opacity="{o}"><ellipse cx="68" cy="114" rx="9" ry="5" fill="#ff9aa6"/><ellipse cx="132" cy="114" rx="9" ry="5" fill="#ff9aa6"/></g>'

def face(eyes="open", look=(0,0), m="smile", br="normal", strong=False):
    return f'''<g>{eye(78,100,eyes,look)}{eye(122,100,eyes,look)}{brows(br)}{blush(strong)}{mouth(m)}</g>'''

def svg(*parts, tilt=0, extra=""):
    inner = "".join(parts)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -6 228 266" width="228" height="266">{defs()}
<ellipse cx="100" cy="252" rx="44" ry="6" fill="rgba(0,0,0,0.18)"/>
<g transform="rotate({tilt} 100 250)">{inner}</g>{extra}</svg>'''

def char(f, arms="down", walk=0, tilt=0, extra="", wave=0, page=0, headtilt=0):
    a = ""
    if arms == "down": a = arm_down(-1) + arm_down(1)
    elif arms == "wave": a = arm_down(-1) + arm_wave(wave)
    elif arms == "chin": a = arm_down(-1) + arm_chin()
    behind = ""; front = ""
    if arms == "book": front = book(page)
    else: front = a
    headg = f'<g transform="rotate({headtilt} 100 140)">{hair_back()}{head()}{f}{bangs()}{hairpin()}</g>'
    return svg(legs(walk), body(), headg, front, tilt=tilt, extra=extra)

Z = lambda x,y,s,o=1: f'<text x="{x}" y="{y}" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="{s}" fill="#9aa6e8" opacity="{o}">z</text>'
SWEAT = '<path d="M152 72 Q158 84 152 90 Q146 84 152 72 Z" fill="#9fd4ff" stroke="#5aa7e0" stroke-width="1.5"/>'
SPARK = lambda x,y,s: f'<path d="M{x} {y-s} L{x+s*0.3} {y-s*0.3} L{x+s} {y} L{x+s*0.3} {y+s*0.3} L{x} {y+s} L{x-s*0.3} {y+s*0.3} L{x-s} {y} L{x-s*0.3} {y-s*0.3} Z" fill="#ffd45a"/>'
DOTS = lambda n: "".join(f'<circle cx="{150+i*12}" cy="34" r="4" fill="#9a8ad8" opacity="{1 if i<n else 0.25}"/>' for i in range(3))

frames = {
  "idle/01.png": char(face("open")),
  "idle/02.png": char(face("closed")),
  "talk/01.png": char(face("open", m="open")),
  "talk/02.png": char(face("open", m="smile")),
  "talk/03.png": char(face("open", m="small")),
  "think/01.png": char(face("open", look=(-3,-4), m="wavy", br="think"), arms="chin", extra=DOTS(1), headtilt=-4),
  "think/02.png": char(face("open", look=(-3,-4), m="wavy", br="think"), arms="chin", extra=DOTS(2), headtilt=-4),
  "think/03.png": char(face("open", look=(-3,-4), m="wavy", br="think"), arms="chin", extra=DOTS(3), headtilt=-4),
  "happy/01.png": char(face("happy", m="big", strong=True), extra=SPARK(40,60,9)+SPARK(166,104,6)),
  "happy/02.png": char(face("happy", m="big", strong=True), extra=SPARK(40,60,6)+SPARK(166,104,9)),
  "error/01.png": char(face("worry", m="flat", br="worry"), extra=SWEAT),
  "read/01.png": char(face("down", m="smile"), arms="book"),
  "read/02.png": char(face("down", m="smile"), arms="book", page=1),
  "read/03.png": char(face("closed", m="smile"), arms="book"),
  "wave/01.png": char(face("happy", m="open", strong=True), arms="wave", wave=0),
  "wave/02.png": char(face("happy", m="open", strong=True), arms="wave", wave=1),
  "sleep/01.png": char(face("closed", m="sleep"), headtilt=-8, extra=Z(146,60,16)+Z(162,40,22,0.6)),
  "sleep/02.png": char(face("closed", m="sleep"), headtilt=-8, extra=Z(146,56,16,0.6)+Z(164,36,22)),
  "walk/01.png": char(face("open"), walk=1),
  "walk/02.png": char(face("open"), walk=-1),
}
for name, s in frames.items():
    p = os.path.join(OUT, name.replace(".png", ".svg"))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w").write(s)
print(len(frames))
