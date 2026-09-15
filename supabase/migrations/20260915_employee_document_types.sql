-- Add the document categories used by the employee document workflow.
-- Run this once in Supabase SQL Editor on the existing Bizzio project.
alter type document_type add value if not exists 'address_proof';
alter type document_type add value if not exists 'education_document';
alter type document_type add value if not exists 'employment_document';
