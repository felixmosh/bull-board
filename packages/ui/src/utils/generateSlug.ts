export const generateSlug = (text: string) => {
  return (
    text
      .toLowerCase()
      .match(/[\d\w]+/gi)
      ?.join('-') ?? text
  );
};
