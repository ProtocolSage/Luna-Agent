export type SttResponse = { text: string } & Partial<{
  transcription: string;
  result: { text?: string };
}>;

export const extractText = (
  data: Partial<SttResponse> | null | undefined,
): string => {
  if (!data) return "";
  const candidate = data as {
    text?: string;
    transcription?: string;
    result?: { text?: string };
  };
  return (
    candidate.text ?? candidate.transcription ?? candidate.result?.text ?? ""
  );
};
