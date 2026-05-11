import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageToggle from '../../components/LanguageToggle';
import './privacy.css';

/**
 * Public privacy + terms page. Renders the demo's legal text in both ES and
 * EN; the active locale (driven by i18next) controls which version is shown.
 *
 * Public route — accessible to unauthenticated visitors who click the
 * consent link from the login footer.
 */
export default function PrivacyPage() {
  const { t, i18n } = useTranslation();
  const active = (i18n.resolvedLanguage ?? i18n.language).slice(0, 2);

  return (
    <div className="privacy-page">
      <header className="privacy-topbar">
        <div className="privacy-bar-inner">
          <Link to="/" className="privacy-brand-block" aria-label="Futuros">
            <span className="privacy-brand-name">Futuros</span>
            <span className="privacy-brand-tag">{t('auth.shell.brandTag')}</span>
          </Link>
          <div className="privacy-bar-actions">
            <LanguageToggle />
            <Link to="/" className="privacy-back-link">
              {t('privacy.backLink')}
            </Link>
          </div>
        </div>
      </header>

      <main className="privacy-wrap">
        <p className="privacy-eyebrow">{t('privacy.eyebrow')}</p>
        <h1 className="privacy-title">{t('privacy.title')}</h1>
        <p className="privacy-lede">{t('privacy.lede')}</p>
        <p className="privacy-updated">{t('privacy.updated')}</p>

        {active === 'en' ? <PrivacyEN /> : <PrivacyES />}
      </main>

      <footer className="privacy-footer">
        <span>© 2026 Futuros · {t('auth.shell.brandTag')}</span>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Localized legal text. Kept inside the component (not i18n keys)
   because it's documentation, not UI copy — embedding 90 lines per
   locale into the i18n bundle would bloat every page's translation
   payload for content only the privacy page renders.
   Source: demo.futuros.io/src/prod/privacy.html (verbatim).
   ───────────────────────────────────────────────────────────── */

function PrivacyES() {
  return (
    <>
      <div className="privacy-demo-notice">
        <p>
          <strong>Aviso · Versión demo</strong>
          <br />
          Estos términos aplican exclusivamente a la <em>demo en demo.futuros.io</em>, una versión beta de uso restringido y por invitación. La versión comercial de Futuros, cuando se lance, tendrá un contrato y unos términos propios que podrán diferir de lo descrito aquí.
        </p>
      </div>

      <div className="privacy-callout">
        <p>
          <strong>Lo esencial:</strong> Tus datos son tuyos. Nunca los usamos para entrenar modelos de inteligencia artificial. Nunca los vendemos. Los almacenamos solo el tiempo estrictamente necesario para que la herramienta funcione.
        </p>
      </div>

      <h2>Quiénes somos</h2>
      <p>
        Futuros es una herramienta de análisis estratégico de foresight que utiliza modelos de inteligencia artificial para generar informes a partir de los datos que tú proporcionas. Esta página describe qué hacemos con esa información <strong>en el contexto de la demo alojada en demo.futuros.io</strong>.
      </p>
      <p>
        Si tienes preguntas sobre privacidad, puedes contactarnos en <a href="mailto:hello@futuros.io">hello@futuros.io</a>.
      </p>

      <h2>Qué datos recogemos</h2>
      <h3>Datos que tú introduces</h3>
      <p>
        Cuando usas la herramienta, introduces información sobre tu organización: nombre, sector, mercado, contexto estratégico, factores STEEP, señales de cambio, etc. También puedes introducir el nombre de un consultor o empresa consultora.
      </p>
      <h3>Datos generados por la herramienta</h3>
      <p>
        A partir de tus inputs, los modelos de IA generan informes de escenarios, planificación estratégica, backcasting y prioridades.
      </p>
      <h3>Datos técnicos mínimos</h3>
      <p>
        Como cualquier sitio web, recibimos información técnica básica de tu navegador (dirección IP, tipo de navegador, fecha y hora) cuando accedes a la herramienta. No usamos cookies de seguimiento ni servicios de analítica de terceros.
      </p>

      <h2>Cómo usamos tus datos</h2>
      <ul>
        <li><strong>Para generar tu informe.</strong> Los textos que introduces se envían a la API de Anthropic (el proveedor del modelo de IA que usamos) para generar el contenido del informe. Esto es necesario para que la herramienta funcione.</li>
        <li><strong>Para guardar tus informes.</strong> Los informes se almacenan en nuestra base de datos asociados a tu cuenta para que puedas volver a consultarlos.</li>
        <li><strong>Para autenticarte.</strong> Usamos Clerk como proveedor de identidad. Tu correo y credenciales se gestionan a través de su servicio.</li>
      </ul>

      <h2>Datos y entrenamiento de IA</h2>
      <div className="privacy-callout">
        <p><strong>Nunca usamos tus datos para entrenar modelos de IA.</strong></p>
      </div>
      <p>
        Las llamadas a la API de Anthropic se hacen bajo los términos comerciales estándar, que excluyen el uso de inputs y outputs de clientes para entrenar sus modelos por defecto. Puedes consultar la <a href="https://www.anthropic.com/legal/commercial-terms" target="_blank" rel="noopener">política comercial de Anthropic</a> para más detalle.
      </p>

      <h2>Con quién compartimos tus datos</h2>
      <p>Compartimos datos solo con los proveedores de infraestructura estrictamente necesarios para que la herramienta funcione:</p>
      <ul>
        <li><strong>Anthropic</strong> (proveedor del modelo de IA): recibe los textos que introduces durante la generación del informe. No retiene los datos para entrenamiento.</li>
        <li><strong>Clerk</strong> (proveedor de identidad): gestiona el inicio de sesión, el correo y la contraseña.</li>
      </ul>
      <p>No vendemos tus datos. No los compartimos con terceros con fines de marketing o publicidad.</p>

      <h2>Cuánto tiempo conservamos los datos</h2>
      <ul>
        <li><strong>Tu cuenta y tus informes:</strong> hasta que elimines la cuenta o solicites su borrado.</li>
        <li><strong>Llamadas a la API de Anthropic:</strong> según la política de retención de Anthropic.</li>
        <li><strong>Logs de servidor:</strong> los logs técnicos básicos se rotan en periodos cortos (días, no meses).</li>
      </ul>

      <h2>Tus derechos</h2>
      <p>Bajo el RGPD y normativas similares, tienes derecho a:</p>
      <ul>
        <li>Saber qué datos tenemos sobre ti.</li>
        <li>Pedir que los corrijamos si están equivocados.</li>
        <li>Pedir que los eliminemos.</li>
        <li>Pedir una copia portable de tus datos.</li>
        <li>Oponerte a determinados tratamientos.</li>
        <li>Presentar una reclamación ante la autoridad de control (en España, la <a href="https://www.aepd.es" target="_blank" rel="noopener">AEPD</a>).</li>
      </ul>
      <p>Para ejercer estos derechos, escribe a <a href="mailto:hello@futuros.io">hello@futuros.io</a>.</p>

      <h2>Seguridad</h2>
      <p>
        Tomamos medidas técnicas razonables para proteger tu información: HTTPS en todas las comunicaciones, claves de API gestionadas de forma centralizada, almacenamiento cifrado en proveedores que cumplen estándares de seguridad de la industria.
      </p>
      <p>
        Dicho esto, ningún sistema en internet es perfectamente seguro. Si ocurriera una brecha de seguridad que afecte a tus datos, te avisaremos sin demora.
      </p>

      <h2>Términos de uso</h2>
      <p>Al usar Futuros aceptas:</p>
      <ul>
        <li><strong>Que la herramienta es un apoyo, no un sustituto.</strong> Los informes generados son una ayuda al pensamiento estratégico. Las decisiones empresariales son tuyas y bajo tu responsabilidad.</li>
        <li><strong>Que los modelos de IA pueden generar errores.</strong> Verifica los datos críticos antes de tomar decisiones basadas en el informe.</li>
        <li><strong>No usar la herramienta para fines ilícitos.</strong> No introduzcas datos personales sensibles de terceros sin su consentimiento, ni información clasificada o regulada.</li>
        <li><strong>Que el acceso es por invitación.</strong> Esta versión es de uso restringido y no público.</li>
      </ul>

      <h2>Cambios en esta política</h2>
      <p>Si actualizamos esta política, cambiaremos la fecha de "Última actualización" arriba. Cambios materiales se notificarán al usar la herramienta.</p>

      <h2>Contacto</h2>
      <p>¿Preguntas? <a href="mailto:hello@futuros.io">hello@futuros.io</a></p>
    </>
  );
}

function PrivacyEN() {
  return (
    <>
      <div className="privacy-demo-notice">
        <p>
          <strong>Notice · Demo version</strong>
          <br />
          These terms apply exclusively to the <em>demo at demo.futuros.io</em>, an invite-only beta of restricted use. The commercial version of Futuros, when released, will have its own contract and terms that may differ from what's described here.
        </p>
      </div>

      <div className="privacy-callout">
        <p>
          <strong>The essentials:</strong> Your data is yours. We never use it to train AI models. We never sell it. We only store it for as long as the tool needs it to function.
        </p>
      </div>

      <h2>Who we are</h2>
      <p>
        Futuros is a strategic foresight tool that uses AI models to generate reports from inputs you provide. This page describes what we do with that information <strong>in the context of the demo hosted at demo.futuros.io</strong>.
      </p>
      <p>
        For privacy questions, contact us at <a href="mailto:hello@futuros.io">hello@futuros.io</a>.
      </p>

      <h2>What data we collect</h2>
      <h3>Data you enter</h3>
      <p>
        When you use the tool, you enter information about your organisation: name, sector, market, strategic context, STEEP factors, change signals, and so on. You may also enter a consultant or consulting company name.
      </p>
      <h3>Data the tool generates</h3>
      <p>
        From your inputs, AI models generate scenario reports, scenario planning, backcasting and strategic priorities.
      </p>
      <h3>Minimum technical data</h3>
      <p>
        Like any website, we receive basic technical data from your browser (IP address, browser type, date and time) when you access the tool. We don't use tracking cookies or third-party analytics.
      </p>

      <h2>How we use your data</h2>
      <ul>
        <li><strong>To generate your report.</strong> The text you enter is sent to Anthropic's API (the AI model provider we use) to generate the report content. This is required for the tool to function.</li>
        <li><strong>To save your reports.</strong> Reports are stored in our database, associated with your account, so you can revisit them.</li>
        <li><strong>To authenticate you.</strong> We use Clerk as our identity provider. Your email and credentials are managed through their service.</li>
      </ul>

      <h2>Data and AI training</h2>
      <div className="privacy-callout">
        <p><strong>We never use your data to train AI models.</strong></p>
      </div>
      <p>
        Anthropic API calls are made under standard commercial terms, which exclude the use of customer inputs and outputs for training their models by default. See <a href="https://www.anthropic.com/legal/commercial-terms" target="_blank" rel="noopener">Anthropic's commercial terms</a> for detail.
      </p>

      <h2>Who we share your data with</h2>
      <p>We share data only with infrastructure providers strictly necessary for the tool to function:</p>
      <ul>
        <li><strong>Anthropic</strong> (AI model provider): receives the text you enter during report generation. Does not retain data for training.</li>
        <li><strong>Clerk</strong> (identity provider): manages sign-in, email and password.</li>
      </ul>
      <p>We don't sell your data. We don't share it with third parties for marketing or advertising.</p>

      <h2>How long we keep data</h2>
      <ul>
        <li><strong>Your account and reports:</strong> until you delete the account or request its removal.</li>
        <li><strong>Anthropic API calls:</strong> per Anthropic's retention policy.</li>
        <li><strong>Server logs:</strong> basic technical logs are rotated on short cycles (days, not months).</li>
      </ul>

      <h2>Your rights</h2>
      <p>Under GDPR and similar regulations, you have the right to:</p>
      <ul>
        <li>Know what data we hold about you.</li>
        <li>Request corrections if it's wrong.</li>
        <li>Request deletion.</li>
        <li>Request a portable copy of your data.</li>
        <li>Object to certain processing.</li>
        <li>Lodge a complaint with the supervisory authority (in Spain, the <a href="https://www.aepd.es" target="_blank" rel="noopener">AEPD</a>).</li>
      </ul>
      <p>To exercise these rights, write to <a href="mailto:hello@futuros.io">hello@futuros.io</a>.</p>

      <h2>Security</h2>
      <p>
        We take reasonable technical measures to protect your information: HTTPS on all communications, centrally managed API keys, encrypted storage at providers meeting industry security standards.
      </p>
      <p>
        That said, no system on the internet is perfectly secure. If a breach occurs that affects your data, we'll notify you without delay.
      </p>

      <h2>Terms of use</h2>
      <p>By using Futuros you agree:</p>
      <ul>
        <li><strong>The tool is a support, not a substitute.</strong> Generated reports support strategic thinking. Business decisions are yours and your responsibility.</li>
        <li><strong>AI models can generate errors.</strong> Verify critical data before making decisions based on the report.</li>
        <li><strong>Don't use the tool for unlawful purposes.</strong> Don't enter sensitive personal data of third parties without their consent, or classified or regulated information.</li>
        <li><strong>Access is by invitation.</strong> This version is restricted-access and not public.</li>
      </ul>

      <h2>Changes to this policy</h2>
      <p>If we update this policy, we'll change the "Last updated" date above. Material changes will be notified through the tool.</p>

      <h2>Contact</h2>
      <p>Questions? <a href="mailto:hello@futuros.io">hello@futuros.io</a></p>
    </>
  );
}
