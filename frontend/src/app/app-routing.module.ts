import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MusicCheckerComponent } from './components/music-checker/music-checker.component';
import { SignupComponent } from './components/signup/signup.component';
import { SigninComponent } from './components/signin/signin.component';
import { AdminComponent } from './admin/admin.component';
import { AuthGuard } from './services/auth.guard';
import { MusicGalleryComponent } from './components/music-gallery/music-gallery.component';
import { LandingPageComponent } from './components/landing-page/landing-page.component';
import { ContactComponent } from './components/sub/contact/contact.component';
import { StepsComponent } from './components/sub/steps/steps.component';
import { Features1Component } from './components/sub/features1/features1.component';
import { HeroComponent } from './components/sub/hero/hero.component';
import { FaqComponent } from './components/faq/faq.component';
import { OtherTextComponent } from './components/other-text/other-text.component';
import { TermsConditionsComponent } from './components/legal/terms-conditions/terms-conditions.component';
import { PrivacyPolicyComponent } from './components/legal/privacy-policy/privacy-policy.component';
import { CopyrightPolicyComponent } from './components/legal/copyright-policy/copyright-policy.component';
import { DmcaComponent } from './components/legal/dmca/dmca.component';
import { RefundPolicyComponent } from './components/legal/refund-policy/refund-policy.component';
import { ProComponent } from './components/pro/pro.component';
import { AiMusicComponent } from './components/ai-music/ai-music.component';
import { AccountComponent } from './components/account/account.component';
import { AboutUsComponent } from './components/about-us/about-us.component';
import { AudioDownloadComponent } from './components/audio-download/audio-download.component';
import { PageNotFound } from './page-not-found/page-not-found';
import { MusicGalleryResolver } from './services/music-gallery.resolver';

const routes: Routes = [
  { path: '', component: LandingPageComponent },
  { path: 'home', component: MusicCheckerComponent },
  { path: 'sign-up', component: SignupComponent },
  { path: 'sign-in', component: SigninComponent },
  { 
    path: 'copyright-free-music', 
    component: MusicGalleryComponent,
    resolve: { data: MusicGalleryResolver }
  },
  { 
    path: 'no-copyright-music/:tag', 
    component: MusicGalleryComponent,
    resolve: { data: MusicGalleryResolver }
  },
  { path: 'admin', component: AdminComponent },
  { path: 'contact', component: ContactComponent },
  { path: 'steps', component: StepsComponent },
  { path: 'service', component: Features1Component },
  { path: 'liked-music', component: HeroComponent },
  { path: 'faq', component: FaqComponent },
  { path: 'comparison', component: OtherTextComponent },
  { path: 'terms', component: TermsConditionsComponent },
  { path: 'privacy-policy', component: PrivacyPolicyComponent },
  { path: 'copyright-policy', component: CopyrightPolicyComponent },
  { path: 'dmca', component: DmcaComponent },
  { path: 'refund-policy', component: RefundPolicyComponent },
  { path: 'pro', component: ProComponent, data: { hideChrome: true } },
  { path: 'ai-music-free', component: AiMusicComponent },
  { path: 'account', component: AccountComponent },
  { path: 'about', component: AboutUsComponent },
  { path: 'audio-download', component: AudioDownloadComponent },

  // Wildcard route to catch invalid page
  { path: '**', component: PageNotFound },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    initialNavigation: 'enabledBlocking',
    scrollPositionRestoration: 'top'
  })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
