import Head from 'next/head';
import Link from 'next/link';

export default function Contact() {
  return (
    <>
      <Head>
        <title>Contact - JaidynReiman Productions</title>
        <meta name="description" content="Get in touch with Jaidyn Reiman" />
      </Head>

      <main className="page-wide py-12">
        <header className="mb-12">
          <h1 className="text-3xl font-bold text-site-text mb-1 font-pixel">Contact</h1>
          <p className="text-site-muted font-body">Reach out for inquiries, commissions, or anything else</p>
        </header>

        <div className="space-y-12">
          <section>
            <h2 className="text-2xl font-bold font-pixel text-lpc-accent mb-4">Commission Inquiries</h2>
            <p className="text-site-muted font-body mb-4">
              Interested in commissioning custom art? Check out the{' '}
              <Link href="/commissions" className="text-lpc-accent hover:underline">
                commissions page
              </Link>{' '}
              for available services and pricing. For commissions not listed, you can reach out using one of the
              payment methods below.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold font-pixel text-lpc-accent mb-4">Payment & Contact Methods</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border border-site-muted/30 rounded-md p-6">
                <h3 className="text-lg font-bold font-pixel text-site-text mb-2">Ko-fi</h3>
                <p className="text-site-muted font-body text-sm mb-4">
                  Support the project and send commissions via Ko-fi. General support links are available
                  here, and specific commission links are shown on the commissions page.
                </p>
                <a
                  href="https://ko-fi.com/jaidynreiman"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 bg-site-muted text-site-surface rounded font-bold hover:opacity-80 transition-opacity text-sm"
                >
                  Visit Ko-fi
                </a>
              </div>

              <div className="border border-site-muted/30 rounded-md p-6">
                <h3 className="text-lg font-bold font-pixel text-site-text mb-2">PayPal</h3>
                <p className="text-site-muted font-body text-sm mb-4">
                  Alternative payment method for commissions and support. Send a payment to support the
                  project or pay for commissions directly.
                </p>
                <a
                  href="https://paypal.me/jaidynreiman"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 bg-site-muted text-site-surface rounded font-bold hover:opacity-80 transition-opacity text-sm"
                >
                  Visit PayPal
                </a>
              </div>
            </div>
          </section>

          <section className="border-t border-site-muted/30 pt-8">
            <h2 className="text-2xl font-bold font-pixel text-site-text mb-4">General Inquiries</h2>
            <p className="text-site-muted font-body">
              For questions about the site, assets, or general inquiries, you can reach out via Ko-fi or
              PayPal. While there&apos;s no dedicated email form, these payment platforms allow you to send
              messages along with your support or commission requests.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
