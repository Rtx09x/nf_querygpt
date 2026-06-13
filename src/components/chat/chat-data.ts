export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
};

export const conversationGroups: Array<{
  period: string;
  conversations: Conversation[];
}> = [
  {
    period: "Today",
    conversations: [
      {
        id: "active-users",
        title: "Active users by city",
        messages: [
          {
            id: 1,
            role: "user",
            content: "Which cities have the most active users?",
          },
          {
            id: 2,
            role: "assistant",
            content:
              "Delhi leads with **302 active users**, followed by Mumbai and Hyderabad.\n\n```sql\nSELECT city, COUNT(*) AS active_users\nFROM users\nWHERE account_status = 'active'\nGROUP BY city\nORDER BY active_users DESC;\n```\n\nThe database connection is not wired yet, so this screen currently demonstrates the final response format.",
          },
        ],
      },
      { id: "conversion", title: "Interest to match conversion", messages: [] },
      { id: "revenue", title: "Successful payment revenue", messages: [] },
    ],
  },
  {
    period: "Yesterday",
    conversations: [
      { id: "unread", title: "Unread messages overview", messages: [] },
      { id: "verification", title: "Verification backlog", messages: [] },
    ],
  },
  {
    period: "Last 7 days",
    conversations: [
      { id: "safety", title: "Open safety reports", messages: [] },
      { id: "support", title: "Support ticket CSAT", messages: [] },
    ],
  },
];

export const welcomeMessage: ChatMessage = {
  id: 1,
  role: "assistant",
  content:
    "Ask anything about the NikahForever dataset in English or Hinglish. I will show the generated SQL and keep every query read-only.",
};

export const promptSuggestions = [
  "How many active users are in Delhi?",
  "Pichle 30 din mein kitne matches hue?",
  "Which plan generated the most revenue?",
  "Show open safety reports by reason",
];
