import styles from "./PublicSiteChrome.module.css";

const APP_ORIGIN = "https://spyreels.ai";
const LOGO_URL = `${APP_ORIGIN}/brand/spyreels-logo.png`;

const NAV_LINKS = [
  ["Features", `${APP_ORIGIN}/#features`],
  ["Free Tools", `${APP_ORIGIN}/free-tools`],
  ["How It Works", `${APP_ORIGIN}/#how-it-works`],
  ["Pricing", `${APP_ORIGIN}/pricing#plans`],
  ["FAQ", `${APP_ORIGIN}/#faq`],
  ["Blog", `${APP_ORIGIN}/blog`],
  ["Earn 20%", `${APP_ORIGIN}/affiliate`],
] as const;

const LOGIN_URL = `${APP_ORIGIN}/?auth=login&returnTo=${encodeURIComponent("/research")}`;
const SIGNUP_URL = `${APP_ORIGIN}/?auth=signup&returnTo=${encodeURIComponent("/research")}`;

export function PublicSiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a className={styles.brand} href={`${APP_ORIGIN}/`}>
          <img className={styles.logo} src={LOGO_URL} alt="SpyReels" width={36} height={36} />
          <span>SpyReels</span>
        </a>

        <nav className={styles.nav} aria-label="Public site navigation">
          {NAV_LINKS.map(([label, href], index) => (
            <a className={index === NAV_LINKS.length - 1 ? styles.affiliate : undefined} href={href} key={href}>
              {label}
            </a>
          ))}
        </nav>

        <div className={styles.actions}>
          <a className={styles.login} href={LOGIN_URL}>Log In</a>
          <a className={styles.start} href={SIGNUP_URL}>Start Free</a>
        </div>
      </div>
    </header>
  );
}
