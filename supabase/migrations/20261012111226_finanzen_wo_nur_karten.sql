-- „Wo“ in fin_overview nur aus Kartenzahlungen (Läden): keine Überweisungen an Personen (Miete o. Ä.) an der Wand.
-- (In 20261012111143 ist das schon enthalten; hier für die Datenbank, die zuerst die alte Fassung bekam.)
do $$
begin
  execute replace(pg_get_functiondef('public.fin_overview(date,boolean)'::regprocedure),
    'from spend where booked_on > today - 90 group by counterparty',
    'from spend where booked_on > today - 90 and booked_at is not null group by counterparty');
end $$;
