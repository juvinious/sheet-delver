import PageHeading from '../../../components/PageHeading';
import SourceProfilePanel from '../../../components/SourceProfilePanel';

export default function AdminSourcesPage() {
    return (
        <>
            <PageHeading title="Modules - Sources" description="Public catalogs used for module discovery." />
            <section className="admin-panel overflow-hidden rounded-lg shadow-sm">
                <SourceProfilePanel />
            </section>
        </>
    );
}
