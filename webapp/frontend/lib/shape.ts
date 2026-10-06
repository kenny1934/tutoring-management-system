import { PUBLIC_ROUTE_PREFIXES, PUBLIC_SUBDOMAIN_PREFIXES } from "./public-routes";

/**
 * CSM's own pages use small corners (the Tight scale) and light shadows.
 * The public summer and regular pages are not part of CSM and keep their old
 * rounder shape, which globals.css restores under `data-shape="classic"` on
 * <html>.
 *
 * This runs inline in <head> before the first paint, so a public page never
 * flashes the smaller corners. It reads the same two lists as isPublicPath and
 * isPublicSubdomain, so adding a public route stays one edit in
 * public-routes.ts. LayoutShell keeps the attribute right when someone moves
 * between public and staff pages without a full load.
 */
export const SHAPE_BOOT_SCRIPT = `try{var h=location.hostname,p=location.pathname;if(${JSON.stringify(PUBLIC_SUBDOMAIN_PREFIXES)}.some(function(x){return h.indexOf(x)===0})||${JSON.stringify(PUBLIC_ROUTE_PREFIXES)}.some(function(x){return p===x||p.indexOf(x+"/")===0}))document.documentElement.dataset.shape="classic"}catch(e){}`;

/** Sets or clears the classic shape after a client-side navigation. */
export function applyShape(isPublic: boolean) {
  if (isPublic) document.documentElement.dataset.shape = "classic";
  else delete document.documentElement.dataset.shape;
}
