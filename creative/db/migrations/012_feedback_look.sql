-- Which live look (thermal, …) was drawn on the card an action was about, so the brain can learn which looks people keep and download.
alter table brain_feedback add column if not exists look text;
