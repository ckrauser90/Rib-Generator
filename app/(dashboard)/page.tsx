"use client";

import { useState } from "react";
import { Container } from "../../components/ui/Container";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { DraftCard } from "../../components/ui/DraftCard";
import { EmptyState } from "../../components/ui/EmptyState";

// Mock drafts for skeleton
const mockDrafts = [
  {
    id: "1",
    name: "Mein erster Rib",
    updatedAt: new Date("2026-03-29"),
    thumbnail: undefined,
  },
  {
    id: "2",
    name: "Schüssel Projekt",
    updatedAt: new Date("2026-03-28"),
    thumbnail: undefined,
  },
  {
    id: "3",
    name: "Becher Design",
    updatedAt: new Date("2026-03-25"),
    thumbnail: undefined,
  },
];

export default function DashboardPage() {
  const [drafts] = useState(mockDrafts);

  return (
    <main className="min-h-screen py-8 px-4">
      <Container>
        <PageHeader
          title="Meine Projekte"
          description="Verwalte deine Rib-Entwürfe"
          actions={
            <Button>
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Neues Projekt
            </Button>
          }
        />

        {drafts.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            title="Noch keine Projekte"
            description="Lade ein Foto hoch und erstelle deinen ersten Rib-Entwurf."
            action={{
              label: "Projekt erstellen",
              onClick: () => console.log("create"),
            }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                name={draft.name}
                thumbnail={draft.thumbnail}
                updatedAt={draft.updatedAt}
                onClick={() => console.log("open", draft.id)}
              />
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}