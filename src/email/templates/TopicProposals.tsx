import { Html, Body, Container, Heading, Section, Text, Hr } from "@react-email/components";
import * as React from "react";
import type { TopicProposal } from "@/agents/topicSuggester";

export interface TopicProposalsProps {
  tenant: string;
  date: string;
  proposals: TopicProposal[];
}

export const TopicProposals: React.FC<TopicProposalsProps> = (p) => (
  <Html>
    <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <Container>
        <Heading>💡 Nieuwe topic-voorstellen — {p.date}</Heading>
        <Text>
          {p.proposals.length} voorstellen klaar voor review. Approveer in{" "}
          <code>tenants/{p.tenant}/topics.yaml</code> door{" "}
          <code>status: proposed</code> → <code>status: queued</code> te wijzigen.
        </Text>
        <Hr />
        {p.proposals.map((t) => (
          <Section key={t.id} style={{ marginBottom: 20 }}>
            <Text>
              <strong>{t.title}</strong>
            </Text>
            <Text>
              ID: <code>{t.id}</code> · Pillar: {t.pillar} · Intent: {t.intent} · Priority:{" "}
              {t.priority}
              <br />
              Keyword: <code>{t.target_keyword}</code> · ~{t.intended_word_count}w
            </Text>
            <Text>Bron: {t.proposal_source}</Text>
            <Text>Rationale: {t.proposal_rationale}</Text>
          </Section>
        ))}
      </Container>
    </Body>
  </Html>
);
