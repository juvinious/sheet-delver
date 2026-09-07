import PageHeading from '../../../components/PageHeading';
import CatalogModulePanel from '../../../components/CatalogModulePanel';

export default function AdminAvailableModulesPage() {
    return (
        <>
            <PageHeading title="Modules - Available" description="Modules published by enabled public catalogs." />
            <section className="admin-panel overflow-hidden rounded-lg shadow-sm">
                <CatalogModulePanel mode="available" />
            </section>
        </>
    );
}
