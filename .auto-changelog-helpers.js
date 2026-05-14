module.exports = function (Handlebars) {
  Handlebars.registerHelper('normalize', function (commits, merges, fixes) {
    const result = [];

    function add(item) {
      if (!item) return;
      const c = item.commit || item;
      result.push({
        subject: c.subject || item.subject || item.message || '',
        message: c.message || c.subject || item.message || '',
        author: item.author || c.author || '',
        shorthash: item.shorthash || c.shorthash || '',
        href: item.href || c.href || '',
        breaking: !!(item.breaking || c.breaking),
      });
    }

    (commits || []).forEach(add);
    (merges || []).forEach(add);
    (fixes || []).forEach(add);

    return result;
  });

  Handlebars.registerHelper('features', function (commits) {
    if (!commits) return [];
    return commits.filter((c) => /^feat[(:]/.test(c.message));
  });

  Handlebars.registerHelper('fixes', function (commits) {
    if (!commits) return [];
    return commits.filter((c) => /^[fF]ix[(:\s]/.test(c.message));
  });

  Handlebars.registerHelper('deps', function (commits) {
    if (!commits) return [];
    return commits.filter((c) => c.message.startsWith('chore(deps'));
  });

  Handlebars.registerHelper('chores', function (commits) {
    if (!commits) return [];
    return commits.filter(
      (c) => /^chore[(:]/.test(c.message) && !c.message.startsWith('chore(deps')
    );
  });

  Handlebars.registerHelper('docs', function (commits) {
    if (!commits) return [];
    return commits.filter((c) => /^docs[(:]/.test(c.message));
  });

  Handlebars.registerHelper('refactor', function (commits) {
    if (!commits) return [];
    return commits.filter((c) => /^refactor[(:]/.test(c.message));
  });

  Handlebars.registerHelper('formatAuthor', function (author) {
    if (!author) return '';
    if (/^[a-z0-9[\]()._/-]+$/.test(author)) {
      return '@' + author;
    }
    return author;
  });

  Handlebars.registerHelper('formatUrl', function (url) {
    if (!url) return '';

    return url.replace(/\.git\n\//g, '/').trim();
  });

  Handlebars.registerHelper('others', function (commits) {
    if (!commits) return [];
    return commits.filter(
      (c) => !/^(feat|fix|chore|docs|refactor|test|style|perf|ci|build|revert)[(:]/.test(c.message)
    );
  });
};
