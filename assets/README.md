# Assets Directory

This directory contains all static assets (images, icons, logos) for DIAL.

## Current Files

- **dial-icon.svg** - Main logo/icon used in the header (40x40)
- **favicon.svg** - Browser tab icon (same as dial-icon.svg)

## Adding Your Custom Icon

To replace the default dial icon with your custom 64x64 .ico file:

1. **Copy your .ico file here**: `assets/dial-icon.ico`
2. **Update index.html** (line ~415):
   ```html
   <!-- Replace this: -->
   <img src="assets/dial-icon.svg" alt="DIAL" width="40" height="40">

   <!-- With this: -->
   <img src="assets/dial-icon.ico" alt="DIAL" width="40" height="40">
   ```

3. **Optional**: Also update favicon (line ~18):
   ```html
   <link rel="icon" type="image/x-icon" href="assets/dial-icon.ico">
   ```

## File Organization

- Keep all brand assets (logos, icons) in this folder
- SVG preferred for scalability
- ICO supported for compatibility
- PNG/JPG accepted for raster graphics
