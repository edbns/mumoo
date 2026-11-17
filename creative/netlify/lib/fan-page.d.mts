type FanLink = {
  title: string; artist: string; cover: string | null; preview: string | null;
  services: { service: string; url: string; hidden: boolean }[];
};

export function fanPage(link: FanLink, address: string, home: string, options?: { inPhone?: boolean }): string;
