

# [ ] Inclure ?

**b) Chargement direct d'une URL avec un hash (`http://localhost:5173/#eq:monequation`)**

Même souci : le navigateur essaie de scroller au chargement, mais ne trouve rien dans le document principal (l'id est planqué dans le Shadow DOM). Il faut le refaire manuellement une fois l'éditeur prêt :

```js
function scrollToInitialHash() {
  if (!location.hash) return;
  const shadow = document.getElementById("myst")?.shadowRoot;
  const targetId = decodeURIComponent(location.hash.slice(1));
  const targetEl = shadow?.querySelector(`#${CSS.escape(targetId)}`);
  targetEl?.scrollIntoView({ behavior: "smooth", block: "start" });
}
```

À appeler dans le même `effect()` de disponibilité de l'éditeur, après que la preview ait eu le temps de se rendre au moins une fois (un `setTimeout` court, ou idéalement un abonnement à un signal de "premier rendu terminé" si disponible — sinon un délai de sécurité de quelques centaines de ms).


# [X] Passer un fichier en paramètre...

# [ ] Scrolling

src/MystEditor.jsx — réutilise le helper au lieu du code en dur

jsx
onClick={(ev) => {
  try {
    if (options.onPreviewClick.value?.(ev)) return;
    if (handlePreviewInteraction(ev, options.parent)) return;

    syncCheckboxes(ev, text.lineMap, editorView.value);

    if (options.syncScroll.value && options.mode.value == "Both") {
      handlePreviewClickToScroll(ev, text.lineMap, preview, editorView.value);
    }
  } catch (e) {
    console.error("The following error occured while handling a click on the preview pane");
    console.error(e);
  }
}}

(+ import { handlePreviewInteraction } from "./utils/previewInteractions";)