# Ticket SEC-204: Electron Fuse Hardening

## Summary
- Electron fuse toggles `embeddedAsarIntegrityValidation` and `onlyLoadAppFromAsar` are not configured in the codebase.
- Upgrade Electron to 35.7.5+ and enable the above fuses in the build process.

## Evidence
```
git grep -n "embeddedAsarIntegrityValidation\|onlyLoadAppFromAsar" -- ':!dist'
# no matches
```

## Rationale
Without these fuses enabled, packaged builds remain vulnerable to the known Electron ASAR integrity bypass CVE. Upgrading Electron and setting the fuses closes this gap.

## Follow Up
- [ ] Upgrade Electron to 35.7.5 or later.
- [ ] Configure `embeddedAsarIntegrityValidation` fuse during packaging.
- [ ] Configure `onlyLoadAppFromAsar` fuse during packaging.
- [ ] Validate fuse settings via automated test in CI.
