import { publicAuthHandoffPath } from "../../shared/publicAuthHandoff";
import {
  resolvePublicAppOrigin,
  resolvePublicSiteOrigin,
} from "../lib/appOrigin";
import styles from "./PublicSiteChrome.module.css";

const SITE_ORIGIN = resolvePublicSiteOrigin();
const APP_ORIGIN = resolvePublicAppOrigin();
const LOGO_URL = `${SITE_ORIGIN}/brand/spyreels-logo.png`;

const NAV_LINKS = [
  ["Features", `${SITE_ORIGIN}/#features`],
  ["Free Tools", `${SITE_ORIGIN}/free-tools`],
  ["How It Works", `${SITE_ORIGIN}/#how-it-works`],
  ["Pricing", `${SITE_ORIGIN}/pricing#plans`],
  ["FAQ", `${SITE_ORIGIN}/#faq`],
  ["Blog", `${SITE_ORIGIN}/blog`],
  ["Earn 20%", `${SITE_ORIGIN}/affiliate`],
] as const;

const LOGIN_URL = `${APP_ORIGIN}${publicAuthHandoffPath("login")}`;
const SIGNUP_URL = `${APP_ORIGIN}${publicAuthHandoffPath("signup")}`;

export function PublicSiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a className={styles.brand} href={`${SITE_ORIGIN}/`}>
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
