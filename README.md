# Headspace

A lil' tool that lets you customize names and pronouns while reading on a select number of fiction sites. Uses a natural language engine ([`compromise`](https://github.com/spencermountain/compromise)) to recognize parts of speech and substitute desired pronouns. Allows for global or fic-specific customization.

**Supported sites:** AO3, Literotica

<img width="200" alt="Screenshot-2026-03-27-22 34 55" src="https://github.com/user-attachments/assets/9aa20d53-a8a4-4022-965b-4af3839b4fd0" />

<img width="400" alt="Screenshot-2026-03-27-22 34 41" src="https://github.com/user-attachments/assets/5f581df8-6254-483e-a359-8bfad061c9d4" />

## Limitations

Can't disambiguate individual character pronouns. This is another way of saying: when this is on, everyone is gay (you're welcome).

Swapping from binary to non-binary pronouns works better than the reverse. The script has a lot of logic for deciding when exactly to use e.g. they, them, or theirs, but is much less capable of e.g. recognizing when to leave "they" alone or turn it into "she".

## Install

1. Open [Tampermonkey](https://www.tampermonkey.net/) (or your preferred userscript manager)
2. Create a new script and paste in [`headspace.user.js`](https://github.com/spin-drift/headspace/raw/refs/heads/main/headspace.user.js)
3. Go to [AO3](https://archiveofourown.org) or [Literotica](https://literotica.com). That's it.

## Usage

**Literotica:** Click the **⚧** icon where fic info is.

**AO3:** Go to **Userscripts** → **Headspace**.

Choose whether to customize **All fics** or **This fic**, then change settings to your liking.

Once you've set fic-specific settings, you won't be able to customize **All fics** again until you click **Clear customizations** (or visit a new fic).

## Love it?

<a href="https://www.buymeacoffee.com/spindrift" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
