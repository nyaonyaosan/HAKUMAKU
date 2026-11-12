# HAKUMAKU

A web application for calculating the transmission and reflection spectra of multilayer thin-film structures.

## Online Demo

[HAKUMAKU Web](https://nyaonyaosan.github.io/HAKUMAKU/)

## Project Structure

- `index.html` — Main user interface
- `styles.css` — Application styling
- `app.js` — Calculation engine and UI control
- `Materials/index.txt` — List of available materials
- `Materials/*.nk` — Optical constants data for each material

## Material Data

Material data are stored in individual `.nk` files, following the same format as the original HAKUMAKU application.

Each `.nk` file contains wavelength-dependent optical constants:

- Refractive index (*n*)
- Extinction coefficient (*k*)

These data are used for calculating the optical properties of multilayer thin-film structures.
