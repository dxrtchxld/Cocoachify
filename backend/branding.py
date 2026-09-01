"""Authoritative accent + font-pack catalog for Brand Studio.

Mirrors frontend `src/context/ThemeContext.tsx`'s ACCENTS/FONT_PACKS — keep in
sync. Server-side validation exists so a client can't unlock a premium
look by simply calling the API with a value it isn't entitled to.
"""

ACCENTS = {
    "#E5D0A1": False,  # Champagne
    "#E7E7EA": False,  # Platinum
    "#34E27A": False,  # Emerald
    "#8EC5FF": False,  # Sky
    "#FF6F61": False,  # Coral
    "#C4B0FF": False,  # Violet
    "#F5A3C7": False,  # Rose
    "#D4AF37": True,   # Onyx Gold
    "#E5484D": True,   # Crimson
    "#2DD4BF": True,   # Ocean
    "#BEF264": True,   # Lime
    "#F472B6": True,   # Magenta
    "#818CF8": True,   # Indigo
    "#FBBF24": True,   # Amber
    "#4ADE80": True,   # Jade
}

FONT_PACKS = {
    "signature": False,
    "bold_impact": True,
    "editorial_mono": True,
}


def accent_allowed(hex_color: str, is_premium: bool) -> bool:
    if hex_color not in ACCENTS:
        return False
    return is_premium or not ACCENTS[hex_color]


def font_pack_allowed(pack: str, is_premium: bool) -> bool:
    if pack not in FONT_PACKS:
        return False
    return is_premium or not FONT_PACKS[pack]
