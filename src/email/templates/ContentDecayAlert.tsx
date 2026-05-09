import { Html, Body, Container, Heading, Text, Hr } from "@react-email/components";
import * as React from "react";

export interface ContentDecayItem {
  page: string;
  position_now: number;
  position_prev: number;
  clicks_now: number;
  clicks_prev: number;
  impressions_now: number;
}

export interface ContentDecayAlertProps {
  tenant: string;
  date: string;
  decaying: ContentDecayItem[];
}

export const ContentDecayAlert: React.FC<ContentDecayAlertProps> = (p) => (
  <Html>
    <Body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <Container>
        <Heading>📉 Content decay rapport — {p.date}</Heading>
        <Text>{p.decaying.length} pagina's tonen dalende rankings of clicks.</Text>
        <Hr />
        {p.decaying.map((d) => (
          <div key={d.page} style={{ marginBottom: 16 }}>
            <Text>
              <strong>
                <a href={d.page}>{d.page}</a>
              </strong>
            </Text>
            <Text>
              Positie: {d.position_prev.toFixed(1)} → {d.position_now.toFixed(1)} (
              {(d.position_now - d.position_prev).toFixed(1)})<br />
              Clicks: {d.clicks_prev} → {d.clicks_now} (
              {d.clicks_prev > 0
                ? Math.round(((d.clicks_now - d.clicks_prev) / d.clicks_prev) * 100)
                : 0}
              %)<br />
              Impressies: {d.impressions_now}
            </Text>
          </div>
        ))}
      </Container>
    </Body>
  </Html>
);
