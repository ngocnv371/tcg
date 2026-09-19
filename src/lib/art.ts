/**
 * Catalog art (`cards.art_path`, `dungeons.art_path`) is either an absolute URL
 * once content is uploaded to a public Storage bucket, or a local `art/...`
 * placeholder written by a `--stage-art` run. Only http(s) values are real
 * assets today; local paths are placeholders that ship with the bundle.
 */
export function resolveArtSrc(artPath: string | null): string | null {
  return artPath?.startsWith('http') ? artPath : null
}
