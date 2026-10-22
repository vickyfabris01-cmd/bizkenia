// src/components/ui/ImageUploadButton.jsx — NEW FILE
//
// AIM
// The one "choose a photo" button for the smart upload. It replaces a plain file input: the person
// picks a photo, the crop window (ImageCropper) opens so they can frame it, pick JPEG, PNG or WebP,
// and confirm, and only then is the finished File given to the page, which uploads it as before.
// It draws as a <label>, so each page keeps its own button look by passing its own className.
//
// PROPS
//   preset      "hero" | "cover" | "product" | "room"   what shape to crop to (see lib/imagePipeline.js)
//   onFiles     (files: File[]) => void                  the cropped photos, in the order chosen
//   children    the button text (e.g. "Replace photo")
//   className   the page's own button class (default: none)
//   disabled    true while the page is busy or the limit is reached
//   multiple    allow choosing several photos; each is framed in turn ("2 of 3")
//   maxFiles    most photos that may be chosen at once; more than this is refused BEFORE any framing starts
//   ariaLabel   label for the hidden file input
//
// Cancel while framing stops the rest of the queue and still hands over the photos already done.

import "./ImageCropper.css";
import { useRef, useState } from "react";
import ImageCropper from "./ImageCropper.jsx";
import { looksLikeImage } from "../../lib/imagePipeline.js";

export default function ImageUploadButton({ preset, onFiles, children, className = "", disabled = false, multiple = false, maxFiles = Infinity, ariaLabel = "Choose a photo" }) {
  const [queue, setQueue] = useState([]);
  const [pos, setPos] = useState(0);
  const [error, setError] = useState("");
  const done = useRef([]);

  function onPick(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // so choosing the same photo again still counts
    if (!picked.length) return;
    const pictures = picked.filter(looksLikeImage);
    setError(pictures.length < picked.length ? "Please choose picture files, such as JPG, PNG or WebP." : "");
    if (!pictures.length) return;
    if (pictures.length > maxFiles) {
      setError(maxFiles > 0 ? `You can add ${maxFiles} more photo${maxFiles === 1 ? "" : "s"}.` : "No more photos can be added.");
      return;
    }
    done.current = [];
    setPos(0);
    setQueue(pictures);
  }

  function finish() {
    const files = done.current;
    done.current = [];
    setQueue([]);
    setPos(0);
    if (files.length) onFiles(files);
  }

  function onDone(file) {
    done.current.push(file);
    if (pos + 1 < queue.length) setPos(pos + 1);
    else finish();
  }

  return (
    <>
      <label className={className}>
        {children}
        <input type="file" accept="image/*" multiple={multiple} disabled={disabled} onChange={onPick} aria-label={ariaLabel} />
      </label>
      {error && <span className="imgup__error" role="alert">{error}</span>}
      {queue.length > 0 && (
        <ImageCropper
          key={`${pos}-${queue[pos].name}-${queue[pos].size}`}
          file={queue[pos]}
          preset={preset}
          step={{ index: pos, total: queue.length }}
          onDone={onDone}
          onCancel={finish}
        />
      )}
    </>
  );
}
