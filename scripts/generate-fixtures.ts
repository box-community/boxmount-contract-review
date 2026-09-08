import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

const outputPath = resolve(
  "fixtures/box-workspace/Incoming/Acme-MSA.docx",
);

function heading(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 100 },
  });
}

function clause(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    spacing: { after: 160, line: 300 },
  });
}

const document = new Document({
  creator: "Box Mount demo",
  title: "Synthetic Acme Master Services Agreement",
  description: "Synthetic contract fixture. Not legal advice.",
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [
            new TextRun({
              text: "MASTER SERVICES AGREEMENT",
              bold: true,
              size: 32,
            }),
          ],
        }),
        clause(
          'This Master Services Agreement ("Agreement") is entered into as of August 1, 2026, by and between Acme Data Systems, Inc., a Delaware corporation ("Supplier"), and Northstar Analytics, Inc., a California corporation ("Customer"). This document is entirely synthetic and provided only for a software demonstration.',
        ),
        heading("1. Services"),
        clause(
          "1.1 Supplier will provide the hosted analytics, implementation, and support services described in mutually executed order forms. Supplier may use subcontractors and remains responsible for their performance.",
        ),
        clause(
          "1.2 Supplier may materially modify the services at any time. Customer's continued use after notice constitutes acceptance of the modification.",
        ),
        heading("2. Fees and Payment"),
        clause(
          "2.1 Customer will pay the fees in each order form. Undisputed invoices are due sixty (60) days after receipt. Late balances accrue interest at 1.5% per month.",
        ),
        clause(
          "2.2 Supplier may increase recurring fees by up to twelve percent (12%) at each renewal without Customer's consent.",
        ),
        heading("3. Customer Data"),
        clause(
          "3.1 Customer retains ownership of Customer Data. Customer grants Supplier a worldwide, perpetual, irrevocable, transferable, and sublicensable license to use Customer Data to provide the services, develop commercial products, train general-purpose machine-learning models, create benchmarks, and for any other business purpose.",
        ),
        clause(
          "3.2 Supplier may retain de-identified Customer Data indefinitely. Supplier will determine in its sole discretion whether data has been sufficiently de-identified.",
        ),
        heading("4. Security and Incidents"),
        clause(
          "4.1 Supplier will maintain commercially reasonable safeguards. Supplier does not warrant compliance with any particular security framework.",
        ),
        clause(
          "4.2 Supplier will notify Customer of a confirmed security incident affecting Customer Data when Supplier determines notification is appropriate. No specific notification period applies.",
        ),
        heading("5. Confidentiality"),
        clause(
          "5.1 Each party will protect the other party's Confidential Information using reasonable care and use it only to perform this Agreement. These obligations survive for three years after disclosure, except for trade secrets protected by applicable law.",
        ),
        heading("6. Indemnification"),
        clause(
          "6.1 Customer will defend, indemnify, and hold harmless Supplier and its affiliates from all claims, losses, damages, penalties, costs, and expenses arising from Customer Data, Customer's use of the services, any breach of this Agreement, or any allegation related to Customer's business.",
        ),
        clause(
          "6.2 Supplier has no indemnification obligation. Supplier may participate in any defense at Customer's expense, and Customer may not settle without Supplier's written approval.",
        ),
        heading("7. Limitation of Liability"),
        clause(
          "7.1 CUSTOMER'S AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT IS UNLIMITED. SUPPLIER'S AGGREGATE LIABILITY WILL NOT EXCEED THE FEES PAID BY CUSTOMER DURING THE ONE (1) MONTH PRECEDING THE EVENT GIVING RISE TO THE CLAIM.",
        ),
        clause(
          "7.2 Supplier will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages. This exclusion does not limit Customer's liability.",
        ),
        heading("8. Term and Renewal"),
        clause(
          "8.1 The initial term is one year. The Agreement automatically renews for successive one-year periods unless Customer provides written notice of non-renewal at least one hundred twenty (120) days before the current term ends.",
        ),
        heading("9. Termination"),
        clause(
          "9.1 Supplier may terminate this Agreement or suspend the services for convenience upon ten (10) days' notice. Customer may terminate only if Supplier materially breaches this Agreement and fails to cure within ninety (90) days after notice.",
        ),
        clause(
          "9.2 Upon termination, all unpaid future fees for the remainder of the then-current term become immediately due and non-refundable.",
        ),
        heading("10. Governing Law and Disputes"),
        clause(
          "10.1 This Agreement is governed by the laws of the Cayman Islands. Any dispute will be finally resolved by confidential arbitration in George Town, Cayman Islands, and each party waives trial by jury.",
        ),
        heading("11. General"),
        clause(
          "11.1 Supplier may assign this Agreement without notice. Customer may not assign it without Supplier's prior written consent.",
        ),
        clause(
          "11.2 This Agreement and its order forms constitute the complete agreement and supersede prior discussions. Amendments must be in writing signed by authorized representatives of both parties.",
        ),
        new Paragraph({
          spacing: { before: 420 },
          children: [
            new TextRun({
              text: "SYNTHETIC DEMO DOCUMENT — NOT LEGAL ADVICE",
              bold: true,
              color: "A33A20",
            }),
          ],
        }),
      ],
    },
  ],
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, await Packer.toBuffer(document));
console.log(`Generated ${outputPath}`);
