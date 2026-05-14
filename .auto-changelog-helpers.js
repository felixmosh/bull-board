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
    return commits.filter(function (c) { return /^feat(\(|:)/.test(c.message); });
  });

  Handlebars.registerHelper('fixes', function (commits) {
    if (!commits) return [];
    return commits.filter(function (c) { return /^fix(\(|:)/.test(c.message); });
  });

  Handlebars.registerHelper('deps', function (commits) {
    if (!commits) return [];
    return commits.filter(function (c) { return /^chore\(deps/.test(c.message); });
  });

  Handlebars.registerHelper('chores', function (commits) {
    if (!commits) return [];
    return commits.filter(function (c) { return /^chore(\(|:)/.test(c.message) && !/^chore\(deps/.test(c.message); });
  });

  Handlebars.registerHelper('docs', function (commits) {
    if (!commits) return [];
    return commits.filter(function (c) { return /^docs(\(|:)/.test(c.message); });
  });

  Handlebars.registerHelper('refactor', function (commits) {
    if (!commits) return [];
    return commits.filter(function (c) { return /^refactor(\(|:)/.test(c.message); });
  });

  Handlebars.registerHelper('formatAuthor', function (author) {
    if (!author) return '';
    if (/^[a-z0-9[\]()._/-]+$/.test(author)) {
      return '@' + author;
    }
    return author;
  });

  Handlebars.registerHelper('others', function (commits) {
    if (!commits) return [];
    return commits.filter(function (c) { return !/^(feat|fix|chore|docs|refactor|test|style|perf|ci|build|revert)(\(|:)/.test(c.message); });
  });
};
