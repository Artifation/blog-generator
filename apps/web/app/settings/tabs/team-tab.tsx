"use client";

import { TeamSection, type TeamMember } from "../team-section";

interface Props {
  members: TeamMember[];
  canManage: boolean;
}

export function TeamTab({ members, canManage }: Props) {
  return <TeamSection members={members} canManage={canManage} />;
}
