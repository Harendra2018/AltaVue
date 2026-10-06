# Altavue (Vite)

## 1. Add your files to `public/`
```
public/
  jet.glb            <- full model (desktop), aircraft lights baked in
  jet_low.glb        <- light model, gear up (phones/tablets), aircraft lights baked in
  daytime.exr        <- full environment (desktop)
  daytime_low.exr    <- light environment (phones/tablets)
  img/            <- copy your whole old img/ folder here (ocean_cine.jpg is already in)
  draco/          <- already included
```

## 2. Run
Install Node.js (LTS) from nodejs.org once, then in this folder:
```
npm install
npm run dev
```
It prints a **Local** and a **Network** address. Open the Network one
(e.g. http://192.168.1.5:5173) on your phone, same Wi-Fi.

## 3. Build / deploy
```
npm run build      # outputs dist/
npm run preview    # test the build locally (also has a Network address)
```
Upload `dist/` to Netlify, Vercel, Cloudflare Pages or any static host.
Copy `public/` files BEFORE building so the preload links are rewritten.

## Tweaking
All 3D settings are at the top of `src/hero3d.js`
(pose, scroll swing `SCROLL_DEG`, mobile offset `MOBILE_SHIFT`).

## How it behaves
- **Desktop:** a loading screen (logo + progress bar) covers the page until `jet.glb` + `daytime.exr` are loaded and the first 3D frame is drawn, then the site appears. After 30 s, or if 3D fails, it shows the image instead.
- **Phones / tablets / small screens:** same loading screen as desktop, but with the lite scene (`jet_low.glb` + `daytime_low.exr`,
  no depth of field, smaller shadows, pixel ratio capped at 1.5). After 40 s, if 3D fails, or if Data Saver is on,
  it shows the image (`public/img/ocean_cine.jpg`) instead.
- Add `?debug` to the URL for an on-screen log.

## Faster model loading
- Biggest wins are file size. Shrink the model:
  `npx @gltf-transform/cli optimize public/jet.glb public/jet.glb --compress meshopt --texture-size 2048`
- A 2k x 1k `daytime.exr` is plenty for lighting; 4k+ EXRs are tens of MB.

## Aircraft lights
Both models carry an emissive texture that lights the formation strips (pale green), wingtip nav lenses
(green right / red left), white tail lights, and the white + red lenses on each fin pod.
The soft glow around the point lights is added in `src/hero3d.js` (`HALOS` list at the top; sizes/colours are tweakable).
Add `?nolights` to the URL to turn the glow halos off for comparison.


## Credits

3D model: [F-15E Strike Eagle - Fighter Jet - Free](https://sketchfab.com/3d-models/f-15e-strike-eagle-fighter-jet-free-fff7d75490474e9b964d90cc031c8d01) by [bohmerang](https://sketchfab.com/bohmerang), licensed under [CC BY-NC-SA 4.0](http://creativecommons.org/licenses/by-nc-sa/4.0/). The model was modified (optimized, lights/emissive textures added) for this project.