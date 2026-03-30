"use client";

import { useState } from "react";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brown-800 dark:text-cream-100 mb-2">
            Konto erstellen
          </h1>
          <p className="text-sand-500 dark:text-sand-400">
            Starte heute mit deinem ersten Rib-Projekt
          </p>
        </div>

        <Card variant="elevated" className="p-6">
          <form className="flex flex-col gap-4">
            <Input
              type="text"
              label="Name"
              placeholder="Max Mustermann"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              type="email"
              label="E-Mail"
              placeholder="deine@email.de"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              label="Passwort"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" className="w-full mt-2">
              Registrieren
            </Button>
          </form>
        </Card>

        <p className="text-center mt-6 text-sm text-sand-500 dark:text-sand-400">
          Bereits ein Konto?{" "}
          <a href="/login" className="text-terracotta-500 hover:underline">
            Anmelden
          </a>
        </p>
      </div>
    </main>
  );
}