"use client";

import Link from "next/link";
import { Container } from "../../components/ui/Container";
import { Button } from "../../components/ui/Button";

export default function EditorPage() {
  return (
    <main className="min-h-screen py-8 px-4">
      <Container>
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Zurück zu Projekten
            </Button>
          </Link>
        </div>

        <div className="bg-cream-50 dark:bg-night-800 rounded-xl border border-cream-200 dark:border-night-600 p-6 text-center">
          <h2 className="text-xl font-semibold text-brown-800 dark:text-cream-100 mb-2">
            Kontur-Editor
          </h2>
          <p className="text-sand-500 dark:text-sand-400 mb-4">
            Hier wird der bestehende Kontur-Editor integriert.
          </p>
          <div className="bg-cream-200 dark:bg-night-700 rounded-lg p-8 text-sand-400 dark:text-sand-400">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p>Bestehende page.tsx Komponente wird hier eingebunden</p>
          </div>
        </div>
      </Container>
    </main>
  );
}