export function spatialEffectReady(editor) {
  return Boolean(editor.spatialScene?.status === 'completed'
    && editor.spatialScene.provider !== 'local_fallback'
    && editor.spatialSceneMedia?.background && editor.spatialSceneMedia?.mask)
}

export function spatialEffectActive(editor) {
  return editor.effect !== 'none' && editor.spatialEnabled === true && spatialEffectReady(editor)
}

// One pipeline per editor/photo. Finishing an old request must not start the
// next stage for a replacement photo or turn effects back on.
export function createEffectPreparation({current, analyzed, spatialReady, analyze, spatial}) {
  const flights = new WeakMap()
  return function prepare() {
    const editor = current()
    if (editor.effect === 'none' || !editor.imageSrc) return Promise.resolve()
    const src = editor.imageSrc, file = editor.imageFile
    const previous = flights.get(editor)
    if (previous?.src === src && previous.file === file) return previous.promise
    const valid = () => current() === editor && editor.imageSrc === src && editor.imageFile === file && editor.effect !== 'none'
    const flight = {src, file}
    flight.promise = (async () => {
      if (!spatialReady(editor)) await spatial()
      if (!valid()) return
      if (!analyzed(editor)) await analyze()
    })().finally(() => { if (flights.get(editor) === flight) flights.delete(editor) })
    flights.set(editor, flight)
    return flight.promise
  }
}
