alter table receipts
  add column if not exists post_to_ledger boolean not null default true,
  add column if not exists non_posting_comment text;
