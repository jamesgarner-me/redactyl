// Recognise a CSV column header that titles a column of people's names, so the
// CSV adapter can treat its values as PERSON even when the model misses a
// low-context name sitting alone in a cell. This keys off the *author's* heading
// — a strong, near-zero-false-positive signal — mirroring the labelled-field
// detector that catches prose addresses by their "Residential address:" label.
//
// Kept dependency-free so it can be imported from tests and the document adapter
// without dragging in detection or React.

// Collapse a header to lowercase alphanumerics so "Full Name", "full_name" and
// "fullName" all compare equal.
function normalise(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Person-name headings only. Deliberately an exact allowlist rather than a
// "contains the word name" rule, so "filename", "username", "company name",
// "domain name", "field name" and the like never get mistaken for people.
const NAME_HEADERS = new Set<string>([
  'name',
  'names',
  'person',
  'persons',
  'people',
  'fullname',
  'firstname',
  'lastname',
  'givenname',
  'familyname',
  'surname',
  'forename',
  'forenames',
  'middlename',
  'maidenname',
  'preferredname',
  'contactname',
  'customername',
  'clientname',
  'employeename',
  'staffname',
  'studentname',
  'patientname',
  'membername',
  'personname',
  'legalname',
  'recipientname',
  'sendername',
  'applicantname',
  'ownername',
  'holdername',
  'guestname',
  'tenantname',
  'candidatename',
  'authorname',
  'accountholder',
  'accountholdername',
  'cardholder',
  'cardholdername',
  'beneficiaryname',
]);

// True when `header` titles a column of people's names.
export function isNameHeader(header: string): boolean {
  return NAME_HEADERS.has(normalise(header));
}
