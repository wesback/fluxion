import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { Navbar } from "@/components/navbar";
import { Toaster } from "sonner";
import { TelemetryProvider } from "@/components/telemetry-provider";

export const metadata: Metadata = {
  title: "Fluxion - Package Update Tracking",
  description: "Track Linux package updates across multiple hosts",
  openGraph: {
    title: "Fluxion - Package Update Tracking",
    description: "Track Linux package updates across multiple hosts",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runtime configuration injected at container startup */}
        <script src="/config.js" async></script>
      </head>
      <body className="antialiased">
        <a href="#main-content" className="skip-nav">Skip to main content</a>
        <TelemetryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              <Navbar />
              <main id="main-content" className="container mx-auto px-4 py-4 md:py-8">
                {children}
              </main>
              <Toaster richColors position="top-right" />
            </QueryProvider>
          </ThemeProvider>
        </TelemetryProvider>
      </body>
    </html>
  );
}
