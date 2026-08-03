const fallbackOrigin = "https://report.local"

function locationUrl(locationRef) {
	if (typeof locationRef === "string") return new URL(locationRef || "/", fallbackOrigin)

	const base = locationRef?.origin && locationRef.origin !== "null"
		? `${locationRef.origin}/`
		: fallbackOrigin
	return new URL(locationRef?.href ?? locationRef?.pathname ?? "/", base)
}

function normalizedPath(pathname) {
	if (!pathname || pathname === "/") return "/index.html"
	return pathname.endsWith("/") ? `${pathname}index.html` : pathname
}

export function toggleNavigation(nav, toggle) {
	if (!nav || !toggle) return false

	const nextOpen = nav.getAttribute("data-open") !== "true"
	nav.setAttribute("data-open", String(nextOpen))
	toggle.setAttribute("aria-expanded", String(nextOpen))
	return nextOpen
}

export function markCurrentPage(documentRef, locationRef = "") {
	if (!documentRef?.querySelectorAll) return

	const current = locationUrl(locationRef)
	for (const link of documentRef.querySelectorAll(".site-nav__links a")) {
		const href = link.getAttribute("href")
		let candidate = null
		try {
			if (href) candidate = new URL(href, current)
		} catch {
			candidate = null
		}

		if (
			candidate?.origin === current.origin
			&& normalizedPath(candidate.pathname) === normalizedPath(current.pathname)
		) {
			link.setAttribute("aria-current", "page")
		} else {
			link.removeAttribute("aria-current")
		}
	}
}

export function fillCurrentDates(documentRef, date = new Date(), locale = "en") {
	if (!documentRef?.querySelectorAll) return

	const formatted = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date)
	for (const node of documentRef.querySelectorAll("[data-current-date]")) {
		node.textContent = formatted
	}
}

export function initReportSystem(documentRef = globalThis.document, locationRef = globalThis.location) {
	if (!documentRef?.querySelector || !documentRef?.querySelectorAll) return
	documentRef.documentElement?.classList?.add("report-system-enhanced")

	const nav = documentRef.querySelector(".site-nav")
	const toggle = documentRef.querySelector(".site-nav__toggle")
	if (nav && toggle) {
		toggle.addEventListener("click", () => toggleNavigation(nav, toggle))
	}

	markCurrentPage(documentRef, locationRef)
	fillCurrentDates(documentRef)
}

if (typeof document !== "undefined") {
	initReportSystem(document, globalThis.location)
}
