"""Give a MakeHuman casual suit's T-shirt a colour of its own (every suit in the CC0 packs has the same blue logo tee).

numpy only, so it runs inside Blender (build_person.py) as well as outside. The shirt is found by its colour, not by
where it sits in the picture: strongly saturated mid blue (the jeans are a greyer blue) and the orange trim. Each such
pixel takes the new colour at its own brightness, so the knit's shading stays; the logo's outline goes with it.
"""
import numpy as np


def shirt_mask(rgb):
    """rgb: H x W x 3 floats in 0..1 -> (tee, trim) masks. In these suits' layout the tee fills the top of the picture
    and the sleeves its right edge; the jeans below have flecks of the same blue, so they are left out by place."""
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    blue = (b == mx) & (b > r + 0.25) & (g > r + 0.05) & (sat > 0.55)
    orange = (r == mx) & (r > 0.6) & (r - b > 0.4) & (sat > 0.6)
    h, w = mx.shape
    y, x = np.mgrid[0:h, 0:w]
    shirt_area = (y < 0.47 * h) | (x > 0.7 * w)
    return (blue & shirt_area).astype(np.float32), (orange & shirt_area).astype(np.float32)


def recolour_array(rgba, hex_colour):
    """rgba: H x W x 4 floats in 0..1 (changed in place and returned)."""
    target = np.array([int(hex_colour[i : i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)
    rgb = rgba[..., :3]
    tee, trim = (m[..., None] for m in shirt_mask(rgb))
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    # The blue tee's own brightness is about 0.3; scale so a pixel of that brightness becomes exactly the target.
    shaded = np.clip(target * (lum[..., None] / 0.3), 0, 1)
    # The orange trim becomes a darker band of the same colour.
    rgba[..., :3] = rgb * (1 - tee - trim) + shaded * tee + target * 0.6 * trim
    return rgba


def recolour(image, hex_colour):
    """PIL image -> PIL image (for checking by eye outside Blender)."""
    from PIL import Image

    a = np.asarray(image.convert("RGBA"), np.float32) / 255
    return Image.fromarray((recolour_array(a, hex_colour) * 255).astype(np.uint8))


if __name__ == "__main__":
    # Self-check: the tee's blue turns, a jeans blue-grey and a skin tone stay.
    px = np.array([[[0.17, 0.33, 0.66, 1], [0.35, 0.42, 0.55, 1], [0.8, 0.6, 0.5, 1]]] * 4, np.float32)  # tee rows, then jeans rows
    out = recolour_array(px.copy(), "#B5473A")
    assert out[0, 0, 0] > out[0, 0, 2], out[0, 0]
    assert np.allclose(out[0, 1:], px[0, 1:]), out[0, 1:]
    assert np.allclose(out[3, 0], px[3, 0]), out[3, 0]  # the same blue down among the jeans stays
    print("ok")
