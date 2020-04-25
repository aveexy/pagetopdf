# pagetopdf

Pagetopdf is a simple to use website to pdf converter

##Features
- Exports website as one pdf page
- Removal of overlays and static positioned elements
- Width to media query adjustment
- Supports pages with dynamic content/image loading
- Supports endless scrolling pages

##Usage
```
pagetopdf [options] <url> <out>

Options:
  url                                  website to convert
  out                                  pdf output file
  --vw, --viewport-width <px>          viewport width (default: 1280)
  --vh, --viewport-height <px>         viewport height (default: 1080)
  --nes, --no-check-endless-scrolling  disable checks for endless scrolling
  -s, --scroll-to                      scroll page until specified height value
  --st, --scroll-to-timeout <ms>       timeout for scroll to (default: 4000)
  --ss, --step-scrolling               enables slow scrolling through page (enabled if endless scrolling is detected)
  --ssp, --step-scrolling-pause <ms>   time to wait between scroll-steps (default: 500)
  -w, --wait <ms>                      time to wait for timeout based events in milliseconds (default: 1000)
  --rs, --remove-static                remove static positioned elements
  --rl, --remove-layers <layers>       layers of positioned elements to remove (default: 0)
  -h, --help                           display help for command
```
