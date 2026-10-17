export const approvedSearchPages: ReadonlyArray<{ readonly name: string; readonly href: string }>
export const createPackageSearchHref: (packageName: string) => string
export function isSafeSearchDestination(destination: string, hostnames?: readonly string[]): boolean
