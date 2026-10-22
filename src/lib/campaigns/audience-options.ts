/** What the audience builder's pickers can choose from. Serializable, so it's passed to the client. */
export type AudienceOptions = {
  /** Top-level events, newest first, each with its sub-events. */
  events: {
    id: string;
    name: string;
    checkInEnabled: boolean;
    subevents: { id: string; name: string }[];
  }[];
  roles: { id: number; name: string }[];
};
