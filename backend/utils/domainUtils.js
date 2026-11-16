
/**
 * Extract hostname from a trusted HTTP/HTTPS origin.
 */
export const getHostnameFromOrigin = (origin) => {
    if (typeof origin !== 'string' || !origin.trim()) {
        return null;
    }

    try {
        const parsedUrl = new URL(origin);

        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return null;
        }

        // Origin must not contain a path, query or credentials.
        if (
            parsedUrl.username ||
            parsedUrl.password ||
            parsedUrl.origin !== origin
        ) {
            return null;
        }

        return parsedUrl.hostname.toLowerCase();
    } catch {
        return null;
    }
};

/**
 * Check whether an origin hostname exists in widget.allowedDomains.
 */
export const isAllowedOrigin = (widget, origin) => {
    const hostname = getHostnameFromOrigin(origin);

    if (!hostname || !widget?.allowedDomains) {
        return false;
    }

    const allowedDomains = widget.allowedDomains.map((domain) =>
        String(domain).trim().toLowerCase()
    );

    return allowedDomains.includes(hostname);
};

/**
 * Validate that a page URL belongs to the supplied parent origin.
 */
export const isPageUrlFromOrigin = (pageUrl, origin) => {
    if (typeof pageUrl !== 'string' || !pageUrl.trim()) {
        return false;
    }

    const hostname = getHostnameFromOrigin(origin);

    if (!hostname) {
        return false;
    }

    try {
        const parsedPage = new URL(pageUrl);

        if (!['http:', 'https:'].includes(parsedPage.protocol)) {
            return false;
        }

        return parsedPage.origin === origin;
    } catch {
        return false;
    }
};
